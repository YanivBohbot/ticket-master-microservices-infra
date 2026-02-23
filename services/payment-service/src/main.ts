// services/payment-service/src/main.ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { PaymentService } from "./payment.service";
import { SQSEvent, Context } from "aws-lambda";

export const handler = async (event: SQSEvent, context: Context) => {
  const app = await NestFactory.createApplicationContext(AppModule);
  const paymentService = app.get(PaymentService);

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      // שים לב: המידע מה-Booking נמצא בתוך שדה detail
      const orderData = body.detail; 
      
      console.log(`Processing Order ID: ${orderData.orderId}`);
      await paymentService.processPayment(orderData.orderId);
    } catch (err) {
      console.error("Failed to process record:", err);
      // אם תזרוק שגיאה כאן, ההודעה תחזור לתור (מה שקורה לך עכשיו)
      throw err; 
    }
  }
};
