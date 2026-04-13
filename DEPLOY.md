# Deployment Guide — AIO Health Care Agentic

Live URL: **https://clinadspro.com**
CloudFront URL: **https://d2s8k22yb5c8me.cloudfront.net**
AWS Region: `us-east-1`
Account ID: `809411919411`

---

## Prerequisites

- Docker Desktop must be **running** before any deploy (check taskbar icon)
- AWS CLI configured (`aws sts get-caller-identity` should return account `809411919411`)

---

## Full Redeploy (frontend + backend)

Run these commands in order from the project root (`d:/AIO/Health_Care_Agentic`):

### 1. ECR Login
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 809411919411.dkr.ecr.us-east-1.amazonaws.com
```

### 2. Build Images
Always use `--no-cache` to ensure latest source files are included.

```bash
# Backend (context is project root so skills/ templates are included in the image)
docker build --no-cache -f backend/Dockerfile -t 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/backend:v2 .

# Frontend
docker build --no-cache --build-arg VITE_API_URL=/api -t 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/frontend:latest ./frontend
```

### 3. Push to ECR
```bash
docker push 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/backend:v2
docker push 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/frontend:latest
```

### 4. Redeploy ECS Services
```bash
aws ecs update-service --cluster agentic-healthcare-cluster --service backend-service  --force-new-deployment --region us-east-1
aws ecs update-service --cluster agentic-healthcare-cluster --service frontend-service --force-new-deployment --region us-east-1
```

### 5. Monitor Deployment
```bash
aws ecs describe-services --cluster agentic-healthcare-cluster --services frontend-service backend-service --region us-east-1 --query "services[*].{name:serviceName,running:runningCount,desired:desiredCount,failed:deployments[0].failedTasks,rollout:deployments[0].rolloutState}"     
```

Wait until both show `"rollout": "COMPLETED"`. Takes ~3–5 minutes.

---

## Backend Only

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 809411919411.dkr.ecr.us-east-1.amazonaws.com

docker build --no-cache -f backend/Dockerfile -t 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/backend:v2 .
docker push 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/backend:v2

aws ecs update-service --cluster agentic-healthcare-cluster --service backend-service --force-new-deployment --region us-east-1
```

## Frontend Only

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 809411919411.dkr.ecr.us-east-1.amazonaws.com

docker build --no-cache --build-arg VITE_API_URL=/api -t 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/frontend:latest ./frontend
docker push 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/frontend:latest

aws ecs update-service --cluster agentic-healthcare-cluster --service frontend-service --force-new-deployment --region us-east-1
```

---

## Checking Logs

```bash
# Backend logs (last 50 lines)
aws logs tail /ecs/agentic-healthcare-backend --follow --region us-east-1

# Frontend logs
aws logs tail /ecs/agentic-healthcare-frontend --follow --region us-east-1
```

---

## Troubleshooting

### Changes not showing up after deploy
1. Hard refresh the browser: `Ctrl + Shift + R`
2. Check rollout status (Step 5 above) — if `failedTasks > 0`, check ECS events:
   ```bash
   aws ecs describe-services --cluster agentic-healthcare-cluster --services frontend-service --region us-east-1 --query 'services[0].events[:5]'
   ```

### "Target is in an Availability Zone not enabled for the load balancer"
ECS placed a task in a subnet outside the ALB's AZs. Fix by restricting subnets to only ALB-aligned ones:

```bash
# Frontend
aws ecs update-service \
  --cluster agentic-healthcare-cluster \
  --service frontend-service \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0c2744272d4343731,subnet-0fe1d9f094a74f687],securityGroups=<keep existing>,assignPublicIp=ENABLED}" \
  --force-new-deployment --region us-east-1

# Backend
aws ecs update-service \
  --cluster agentic-healthcare-cluster \
  --service backend-service \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0c2744272d4343731,subnet-0fe1d9f094a74f687],securityGroups=<keep existing>,assignPublicIp=ENABLED}" \
  --force-new-deployment --region us-east-1
```

ALB-aligned subnets (do not change):
- `subnet-0c2744272d4343731` — us-east-1a
- `subnet-0fe1d9f094a74f687` — us-east-1b

### Docker build using stale cache (same JS hash after build)
Always use `--no-cache` flag (already included in commands above).

### Docker Desktop not running
Error: `failed to connect to docker API`. Open Docker Desktop and wait for "Engine running" in the taskbar.

---

## AWS Resource Reference

| Resource | Name / ARN |
|---|---|
| ECS Cluster | `agentic-healthcare-cluster` |
| Backend Service | `backend-service` |
| Frontend Service | `frontend-service` |
| Backend ECR | `809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/backend` |
| Frontend ECR | `809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/frontend` |
| Load Balancer | `agentic-healthcare-alb` |
| Frontend Target Group | `agentic-frontend-tg` |
| ALB Subnets | `subnet-0c2744272d4343731` (1a), `subnet-0fe1d9f094a74f687` (1b) |
| Backend Log Group | `/ecs/agentic-healthcare-backend` |
