import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as events from "aws-cdk-lib/aws-events";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export class TicketSystemInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. EventBus - מרכז העצבים של האירועים
    const ticketEventBus = new events.EventBus(this, "TicketEventBus", {
      eventBusName: "TicketEventBus",
    });

    // 2. Booking Service Lambda
    const bookingLambda = new nodejs.NodejsFunction(this, "BookingHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      entry: path.join(
        __dirname,
        "../../services/booking-service/src/lambda.ts",
      ),
      handler: "handler",
      environment: {
        EVENT_BUS_NAME: ticketEventBus.eventBusName,
      },
      bundling: {
        minify: false,
        sourceMap: true,
        keepNames: true,
        tsconfig: path.join(
          __dirname,
          "../../services/booking-service/tsconfig.json",
        ),
        externalModules: [
          "@nestjs/microservices",
          "@nestjs/websockets",
          "cache-manager",
        ],
      },
    });

    ticketEventBus.grantPutEventsTo(bookingLambda);

    // 3. API Gateway Integration
    const bookingIntegration = new HttpLambdaIntegration(
      "BookingIntegration",
      bookingLambda,
    );
    const httpApi = new apigwv2.HttpApi(this, "TicketHttpApi", {
      apiName: "Ticket Service HTTP API",
      createDefaultStage: true,
    });

    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: bookingIntegration,
    });

    // 4. Queues
    const paymentQueue = new sqs.Queue(this, "PaymentQueue", {
      visibilityTimeout: cdk.Duration.seconds(300),
    });
    const aiAnalysisQueue = new sqs.Queue(this, "AIAnalysisQueue");

    // --- שינוי ה-Logic של ה-Rules ---

    // Rule 1: הזמנה נוצרה -> הולך רק לתור ה-AI (Parallel Processing)
    new events.Rule(this, "OrderCreatedRule", {
      eventBus: ticketEventBus,
      eventPattern: {
        source: ["com.ticket.booking"],
        detailType: ["OrderCreated"],
      },
      targets: [new targets.SqsQueue(aiAnalysisQueue)],
    });

    // Rule 2: תשלום הצליח (PayPal Simulator) -> הולך לתור התשלומים
    new events.Rule(this, "PaymentSucceededRule", {
      eventBus: ticketEventBus,
      eventPattern: {
        source: ["com.ticket.payment.simulator"],
        detailType: ["PaymentSucceeded"],
      },
      targets: [new targets.SqsQueue(paymentQueue)],
    });

    // 5. Database
    const ordersTable = new dynamodb.Table(this, "OrdersTable", {
      partitionKey: { name: "orderId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    ordersTable.grantReadWriteData(bookingLambda);
    bookingLambda.addEnvironment("ORDERS_TABLE", ordersTable.tableName);

    // 6. Payment Service Lambda
    const paymentlambda = new nodejs.NodejsFunction(this, "PaymentHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      entry: path.join(__dirname, "../../services/payment-service/src/main.ts"),
      handler: "handler",
      environment: {
        ORDERS_TABLE: ordersTable.tableName,
      },
      bundling: {
        minify: false,
        sourceMap: true,
        keepNames: true,
        tsconfig: path.join(
          __dirname,
          "../../services/payment-service/tsconfig.json",
        ),
        externalModules: [
          "@nestjs/microservices",
          "@nestjs/websockets",
          "cache-manager",
          "class-transformer",
          "class-validator",
          "@nestjs/platform-express",
        ],
      },
    });

    ordersTable.grantReadWriteData(paymentlambda);
    paymentlambda.addEnvironment("ORDERS_TABLE", ordersTable.tableName);
    paymentlambda.addEventSource(new SqsEventSource(paymentQueue));

    // 7. הקמת ה-AI Agent Lambda
    const aiAgentLambda = new nodejs.NodejsFunction(this, "AiAgentHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512, // ניתן לו קצת יותר זיכרון כי הוא יצטרך לטעון ספריות AI
      timeout: cdk.Duration.seconds(30), // ניתוח AI לוקח זמן, ניתן לו 30 שניות
      entry: path.join(
        __dirname,
        "../../services/ai-agent-service/src/main.ts",
      ),
      handler: "handler",
      bundling: {
        minify: false,
        sourceMap: true,
        keepNames: true,
        tsconfig: path.join(
          __dirname,
          "../../services/ai-agent-service/tsconfig.json",
        ),
        // מתעלמים מספריות כבדות כדי שה-Deploy יהיה מהיר
        externalModules: [
          "@nestjs/microservices",
          "@nestjs/websockets",
          "class-transformer",
          "class-validator",
        ],
      },
    });

    // 8. חיבור התור ללמבדה (הטריגר)
    aiAgentLambda.addEventSource(new SqsEventSource(aiAnalysisQueue));

    aiAgentLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: ["*"], // או ציין ARN ספציפי של המודל לאבטחה מירבית
      }),
    );

    // 1. העברת שם הטבלה כמשתנה סביבה (כדי שנדע לאן לכתוב)
    aiAgentLambda.addEnvironment("ORDERS_TABLE", ordersTable.tableName);

    // 2. מתן הרשאות כתיבה לטבלה (כדי שנוכל לעדכן את השדות)
    ordersTable.grantWriteData(aiAgentLambda);

    // מתן הרשאה ללמבדה לשלוח אימיילים דרך SES
    aiAgentLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"], // בסביבת פרודקשן כדאי להגביל ל-ARN של האימייל הספציפי
      }),
    );
  }
}
