// services/payment-service/src/payment.service.ts
import { Injectable } from "@nestjs/common";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

@Injectable()
export class PaymentService {
  private readonly docClient: DynamoDBDocumentClient;

  constructor() {
    const client = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client);
  }

  async processPayment(orderId: string) {
    console.log(`Updating order ${orderId} to PAID status...`);

    await this.docClient.send(
      new UpdateCommand({
        TableName: process.env.ORDERS_TABLE,
        Key: { orderId },
        UpdateExpression: "set #status = :s",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":s": "PAID" },
      }),
    );
  }
}
