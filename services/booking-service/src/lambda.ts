/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'reflect-metadata';
import { Handler, Context, Callback } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import serverlessExpress from '@vendia/serverless-express';
import { ValidationPipe } from '@nestjs/common';

let server: Handler;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // מסיר שדות שלא מוגדרים ב-DTO
      transform: true, // הופך את הקלט למופע של ה-DTO Class
    }),
  );

  await app.init();
  const expressApp = app.getHttpAdapter().getInstance();
  return serverlessExpress({ app: expressApp });
}

export const handler: Handler = async (
  event: any,
  context: Context,
  callback: Callback,
) => {
  server = server ?? (await bootstrap());
  return server(event, context, callback);
};
