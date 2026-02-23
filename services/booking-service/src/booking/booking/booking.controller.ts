/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Body, Controller, Inject, Post } from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('orders')
export class BookingController {
  // וודא שכתוב private readonly
  constructor(
    @Inject(BookingService) private readonly bookingService: BookingService,
  ) {
    // לוג לבדיקה - יופיע ב-CloudWatch
    console.log('Is BookingService defined?', !!this.bookingService);
  }

  @Post()
  async createOrder(@Body() dto: CreateOrderDto) {
    if (!this.bookingService) {
      console.error('CRITICAL: BookingService is undefined in Controller!');
      throw new Error('Internal Injection Error');
    }
    return this.bookingService.createOrder(dto);
  }
  // --- ה-Endpoint החדש לסימולציה ---
  // בחיים האמיתיים: PayPal היו פונים לכתובת הזו
  // כרגע: אתה תפנה אליה מ-Postman
  @Post('webhook/payment-success')
  async simulatePaymentWebhook(@Body() body: { orderId: string }) {
    return this.bookingService.simulatePaymentSuccess(body.orderId);
  }
}
