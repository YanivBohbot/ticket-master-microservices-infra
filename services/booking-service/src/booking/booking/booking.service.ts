/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class BookingService {
  // הגדרת הטיפוס בצורה מפורשת פותרת את שגיאת ה-ESLint
  private readonly docClient: DynamoDBDocumentClient;
  private readonly eventBridge: EventBridgeClient;

  constructor() {
    const dbClient = new DynamoDBClient({});

    // יצירת ה-DocumentClient עם הגדרות טיפוסים ברורות
    this.docClient = DynamoDBDocumentClient.from(dbClient, {
      marshallOptions: {
        removeUndefinedValues: true, // מומלץ לעבודה עם DynamoDB
      },
    });

    this.eventBridge = new EventBridgeClient({});
  }

  async createOrder(dto: CreateOrderDto) {
    const orderId = `ORD-${Date.now()}`;
    const orderItem = {
      orderId,
      userId: dto.userId,
      amount: dto.amount,
      ticketType: dto.ticketType,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    try {
      // כתיבה ל-DynamoDB
      await this.docClient.send(
        new PutCommand({
          TableName: process.env.ORDERS_TABLE,
          Item: orderItem,
        }),
      );

      // שליחה ל-EventBridge
      await this.eventBridge.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'com.ticket.booking',
              DetailType: 'OrderCreated',
              Detail: JSON.stringify(orderItem),
              EventBusName: process.env.EVENT_BUS_NAME,
            },
          ],
        }),
      );

      return { message: 'Order created successfully', orderId };
    } catch (error) {
      console.error('Error in BookingService:', error);
      throw new InternalServerErrorException('Failed to process order');
    }
  }

  // --- הפונקציה החדשה לסימולציית תשלום ---
  async simulatePaymentSuccess(orderId: string) {
    console.log(`Simulating payment success for Order: ${orderId}`);

    // שליחת אירוע "תשלום הצליח" ל-EventBridge
    await this.eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            // שים לב! זה חייב להיות תואם בדיוק למה שהגדרת ב-CDK
            Source: 'com.ticket.payment.simulator',
            DetailType: 'PaymentSucceeded',
            Detail: JSON.stringify({
              orderId,
              status: 'SUCCESS',
              provider: 'PayPal-Simulator',
              timestamp: new Date().toISOString(),
            }),
            EventBusName: process.env.EVENT_BUS_NAME,
          },
        ],
      }),
    );

    return {
      message: 'Payment confirmation sent to EventBridge',
      orderId,
    };
  }
}
