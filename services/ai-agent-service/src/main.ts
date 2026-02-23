import { Context, SQSEvent, SQSHandler } from "aws-lambda";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses"; // הוספנו את זה

const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });
const dynamoDb = new DynamoDBClient({ region: "us-east-1" });
const ses = new SESClient({ region: "us-east-1" }); // הוספנו קליינט SES
const tableName = process.env.ORDERS_TABLE;

// ⚠️ החלף את זה לאימייל שאימתת ב-Console!
const ADMIN_EMAIL = "mollokapi1@gmail.com";

export const handler: SQSHandler = async (
  event: SQSEvent,
  context: Context,
) => {
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const order = body.detail;

      if (!order?.orderId) {
        console.log("⚠️ Event missing orderId");
        continue;
      }

      console.log(`🧠 AI Agent analyzing Order: ${order.orderId}`);

      // --- שלב 1: שואלים את Claude ---
      const prompt = `
        You are a fraud detection system. Analyze this order JSON:
        ${JSON.stringify(order)}
        
        Rules:
        1. Amount > 2000 -> Risk HIGH.
        2. Amount > 500 -> Risk MEDIUM (VIP).
        3. Else -> Risk LOW.

        Return ONLY JSON: { "risk": "LOW|MEDIUM|HIGH", "recommendation": "string", "vipStatus": boolean }
      `;

      const bedrockCommand = new InvokeModelCommand({
        modelId: "anthropic.claude-3-haiku-20240307-v1:0",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 512,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const response = await bedrock.send(bedrockCommand);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      const aiResultText = responseBody.content[0].text;

      // ניסיון לפרסר את ה-JSON של ה-AI
      let aiData;
      try {
        aiData = JSON.parse(aiResultText);
      } catch (e) {
        console.error("Failed to parse AI JSON response", aiResultText);
        continue;
      }

      console.log(`🤖 AI Result:`, aiData);

      // --- שלב 2: שומרים ל-DynamoDB ---
      console.log(`💾 Saving insights to DB for order ${order.orderId}...`);

      const updateCommand = new UpdateItemCommand({
        TableName: tableName,
        Key: { orderId: { S: order.orderId } },
        UpdateExpression:
          "SET aiRisk = :r, aiRecommendation = :rec, isVip = :v, aiAnalyzedAt = :t",
        ExpressionAttributeValues: {
          ":r": { S: aiData.risk },
          ":rec": { S: aiData.recommendation },
          ":v": { BOOL: aiData.vipStatus },
          ":t": { S: new Date().toISOString() },
        },
      });

      await dynamoDb.send(updateCommand);
      console.log("✅ Order updated successfully in DynamoDB!");
      // --- שלב 3: שליחת התראה במקרה הצורך ---
      if (aiData.risk === "HIGH") {
        console.log("🚨 High Risk detected! Sending email...");

        const emailCommand = new SendEmailCommand({
          Source: ADMIN_EMAIL, // חייב להיות אימייל מאומת
          Destination: { ToAddresses: [ADMIN_EMAIL] },
          Message: {
            Subject: { Data: `🚨 Alert: Risky Order ${order.orderId}` },
            Body: {
              Text: {
                Data: `Risk Level: HIGH\nReason: ${aiData.recommendation}\nAmount: ${order.amount}`,
              },
            },
          },
        });

        await ses.send(emailCommand);
        console.log("📧 Alert email sent successfully!");
      }
    } catch (error) {
      console.error("❌ Error:", error);
    }
  }
};
