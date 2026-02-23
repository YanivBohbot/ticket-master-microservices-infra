# TicketMASTER Microservices + Infra

TicketMASTER is a cloud-native, event-driven ticket booking system with real-time fraud detection, built using microservices and AWS infrastructure-as-code.

## Purpose
This project demonstrates a scalable, production-grade architecture for ticket ordering, payment processing, and AI-powered fraud analysis using modern AWS services and best practices.

## Architecture Overview
- **Booking Service**: NestJS API for creating ticket orders. Publishes events to EventBridge.
- **Payment Service**: Listens for payment events, updates order status in DynamoDB.
- **AI Agent Service**: Consumes order events, analyzes for fraud using Bedrock Claude, updates risk in DynamoDB, and sends SES alerts.
- **Infrastructure**: AWS CDK defines EventBridge, SQS, DynamoDB, Lambda, and API Gateway.

### Data Flow
```
User → Booking API → DynamoDB → EventBridge → SQS → [AI Agent | Payment Service] → DynamoDB/SES
```

## Technologies Used
- **Node.js / TypeScript**: All services
- **NestJS**: Booking and Payment APIs
- **AWS Lambda**: Serverless compute for all services
- **AWS EventBridge**: Event routing between services
- **AWS SQS**: Decoupling and buffering of events
- **AWS DynamoDB**: Order storage
- **AWS Bedrock (Claude 3 Haiku)**: AI fraud detection
- **AWS SES**: Email alerts for high-risk orders
- **AWS CDK**: Infrastructure as code
- **Jest**: Unit and E2E testing

## Getting Started

### Prerequisites
- Node.js 18+
- AWS CLI configured
- AWS account with permissions for Lambda, EventBridge, SQS, DynamoDB, SES, Bedrock
- (Optional) Docker for local development

### Setup
1. Install dependencies:
   ```bash
   npm install
   # Repeat in each service and infra directory
   ```
2. Build all services and infra:
   ```bash
   npm run build
   # Run in each service and infra directory
   ```
3. Deploy infrastructure:
   ```bash
   cd ticket-system-infra
   npm run cdk deploy
   ```
4. Start services locally (for development):
   ```bash
   npm run start:dev
   # In booking-service, payment-service, ai-agent-service
   ```

### Testing
- Unit tests: `npm run test`
- E2E tests (booking-service): `npm run test:e2e`

### Usage
- Create an order: `POST /orders` (booking-service)
- Simulate payment: `POST /orders/webhook/payment-success` with `{ orderId }`
- Fraud analysis and email alerts are automatic via event flow

## File Structure
- `services/booking-service/` - Order API
- `services/payment-service/` - Payment processor
- `services/ai-agent-service/` - Fraud detection
- `ticket-system-infra/` - AWS CDK stack

## Notes
- Environment variables (ORDERS_TABLE, EVENT_BUS_NAME) are injected by CDK
- SES sender email must be verified in AWS
- Bedrock model ID and region are hardcoded in AI agent
- Hebrew comments are present in code; preserve when editing

---

For more details, see `.github/copilot-instructions.md` for AI agent and contributor guidelines.
