import { Module } from "@nestjs/common";
import { PaymentService } from "./payment.service";

@Module({
  imports: [],
  controllers: [],
  providers: [PaymentService],
})
export class AppModule {}
