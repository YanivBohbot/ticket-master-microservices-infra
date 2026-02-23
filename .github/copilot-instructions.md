# TicketMASTER Codebase Guide for AI Agents

## Architecture Overview

**TicketMASTER** is an event-driven microservices system for ticket booking with real-time fraud detection. The architecture uses **AWS Lambda**, **EventBridge**, **DynamoDB**, and **Bedrock AI** for fraud analysis.

### Core Data Flow
```
API Request → Booking Service (Lambda/NestJS) 
  → DynamoDB (order creation) 
  → EventBridge (event routing) 
  → SQS Queues 
  → AI Agent (fraud detection) or Payment Service (status updates)
  → DynamoDB updates + Email alerts (via SES)
```

## Project Structure & Key Services

- **`services/booking-service/`** - NestJS HTTP API for order creation
  - Lambda-compatible handler in `src/lambda.ts`
  - Publishes `OrderCreated` events to EventBridge
  - Endpoint: `POST /orders` creates ticket orders

- **`services/payment-service/`** - Lambda function consuming PaymentSucceeded events
  - Updates order status to "PAID" in DynamoDB
  - Triggered by EventBridge rule for payment simulator

- **`services/ai-agent-service/`** - Bedrock-powered fraud detection Lambda
  - Analyzes orders using Claude 3 Haiku model
  - Detects risk levels: LOW/MEDIUM/HIGH based on amount thresholds
  - Marks VIP users (amount > $500)
  - Sends SES email alerts for HIGH risk orders

- **`ticket-system-infra/`** - AWS CDK infrastructure-as-code
  - Defines EventBus, Lambdas, SQS queues, DynamoDB tables, API Gateway
  - Manages IAM roles and event routing rules
  - Entry point: `lib/ticket-system-infra-stack.ts`

## Event-Driven Integration Patterns

### EventBridge Rules (from CDK Stack)
1. **OrderCreatedRule**: Routes `com.ticket.booking` + `OrderCreated` → AI Analysis Queue
2. **PaymentSucceededRule**: Routes `com.ticket.payment.simulator` + `PaymentSucceeded` → Payment Queue

**Critical**: Event `Source` and `DetailType` must exactly match rule definitions. See examples in booking service:
```typescript
Source: 'com.ticket.booking',
DetailType: 'OrderCreated',
EventBusName: process.env.EVENT_BUS_NAME // from CDK
```

## AWS Services & SDK Patterns

### DynamoDB Integration
- Uses AWS SDK v3 with `DynamoDBDocumentClient` for simpler JSON operations
- Table schema: `orderId` (string partition key), fields like `status`, `amount`, `userId`
- Document client marshalling removes undefined values automatically
- Update patterns use `UpdateExpression` with `ExpressionAttributeValues`

### Lambda Environment Variables (injected by CDK)
```typescript
ORDERS_TABLE     // DynamoDB orders table name
EVENT_BUS_NAME   // EventBridge event bus name
```

### Bedrock AI Integration
- Model: `anthropic.claude-3-haiku-20240307-v1:0`
- Region: `us-east-1`
- Request format: JSON with `anthropic_version: "bedrock-2023-05-31"`, `max_tokens`, `messages`
- Response format: Text content wrapped in `content[0].text`
- IAM requirement: `bedrock:InvokeModel` permission on Lambda

### SES Email Alerts
- Verified sender email: `mollokapi1@gmail.com` (currently hardcoded)
- Requires IAM `ses:SendEmail` or `ses:SendRawEmail` permissions
- Optional in production: send emails only for HIGH risk orders

## Code Conventions & Patterns

### NestJS Module Structure
- Modules declare services via `providers` array
- Dependency injection: `constructor(@Inject(ServiceClass) private service: ServiceClass)`
- Controllers inject services, don't manage AWS clients directly
- Services handle AWS SDK client initialization in constructor

### Lambda Handler Pattern
```typescript
export const handler: SQSHandler = async (event: SQSEvent, context: Context) => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    // Process event...
  }
}
```

### AWS SDK Client Initialization
Clients are instantiated per Lambda request (warm start optimization):
```typescript
const dbClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dbClient, {
  marshallOptions: { removeUndefinedValues: true }
});
```

### Error Handling
- Catch errors in try-catch blocks, log to CloudWatch
- NestJS services throw `InternalServerErrorException` on AWS errors
- Lambda handlers continue processing remaining SQS records on individual failures

### ESLint & TypeScript Strictness
- Projects use `typescript-eslint` with strict checking
- Documented eslint-disable comments allowed for AWS SDK unsafe operations:
  ```typescript
  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  ```
- Always include explicit type assertions where needed

### Comments in Hebrew
- The codebase contains Hebrew comments (e.g., "// הגדרת הטיפוס" = "Type definition")
- Preserve Hebrew comments when editing; add new comments in English or Hebrew consistently

## Testing & Developer Workflows

### Unit Tests
```bash
# In booking-service or payment-service
npm run test              # Run Jest unit tests
npm run test:watch       # Watch mode for development
npm run test:cov         # Coverage report
```

### E2E Tests (Booking Service)
```bash
npm run test:e2e         # Run e2e tests with jest-e2e.json config
```

### Build & Deployment
```bash
# NestJS services
npm run build            # Compile TypeScript
npm run start:dev        # Run with watch mode
npm run start:prod       # Production build execution

# Infrastructure
npm run build            # Compile CDK (in ticket-system-infra/)
npm run cdk deploy       # Deploy to AWS
```

### Local Testing Approach
1. Booking service: Spin up with `npm run start:dev`, test via cURL or Postman
2. Simulate payment: `POST /orders/webhook/payment-success` with `{ orderId: "..." }`
3. Monitor CloudWatch logs from Lambda executions
4. Use AWS CLI to inspect DynamoDB and EventBridge events

## Common Tasks & File References

### Adding a New Event Type
1. Update CDK rule in [ticket-system-infra-stack.ts](ticket-system-infra/lib/ticket-system-infra-stack.ts) with new event pattern
2. Update Lambda handler to recognize new event source/detail type
3. Add SQS routing if needed (new queue + event target)

### Modifying AI Fraud Logic
- File: [ai-agent-service/src/main.ts](services/ai-agent-service/src/main.ts#L30)
- Current rules: Amount > $2000 = HIGH, > $500 = MEDIUM, else LOW
- Bedrock prompt can be customized; response must return JSON with `risk`, `recommendation`, `vipStatus`

### Updating Order Schema
- Primary changes in [booking.service.ts](services/booking-service/src/booking/booking/booking.service.ts#L28) (order creation)
- DynamoDB table defined in CDK stack; update queries in AI agent and payment service
- Document new fields in environment or code comments

### Fixing DynamoDB Query Errors
- Verify `ORDERS_TABLE` env var is set (from CDK)
- Use `DynamoDBDocumentClient` for JSON payloads, not raw client
- For updates, always use `ExpressionAttributeValues` to prevent injection issues

## Development Tips

- **CDK Bundling**: Lambda functions bundled with `keepNames: true` and source maps for debugging
- **External Modules**: Heavy packages (NestJS core, validators) marked as external in CDK bundling to reduce zip size
- **Region Consistency**: All AWS SDK clients use `us-east-1`; changes require CDK updates
- **Event Bus Name**: Always use `process.env.EVENT_BUS_NAME` (injected by CDK), not hardcoded
- **Table Names**: Always use `process.env.ORDERS_TABLE`; schema is implicit from code usage

## Debugging Checklist

- [ ] EventBridge rule pattern matches exact source and detailType
- [ ] Lambda has IAM permissions for accessed services
- [ ] DynamoDB table attributes match query keys and expressions
- [ ] Bedrock model ID is correct; region is `us-east-1`
- [ ] SES sender email is verified in AWS console
- [ ] Environment variables are set by CDK before Lambda invocation
- [ ] JSON parsing in Lambda handlers includes error handling for malformed events
