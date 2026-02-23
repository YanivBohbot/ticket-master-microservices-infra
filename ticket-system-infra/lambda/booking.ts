import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { DetailType } from "aws-cdk-lib/aws-codestarnotifications";
import { STATUS_CODES } from "http";

const client = new EventBridgeClient({});

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // יצירת אירוע שיפורסם ב-EventBridge
  const params = {
    Entries: [
      {
        Source: "com.ticket.booking",
        DetailType: "OrderCreated",
        Detail: event.body ?? "{}",
        EventBusName: process.env.EVENT_BUS_NAME,
      },
    ],
  };

  try {
    await client.send(new PutEventsCommand(params));
    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "ORDER Event published successfully !!",
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to published event", error }),
    };
  }
};
