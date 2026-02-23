import { Module } from '@nestjs/common';
import { BookingModule } from './booking/booking/booking.module';

@Module({
  imports: [BookingModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
