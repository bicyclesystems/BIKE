# 🚀 Personal Project API Documentation

## Overview
This API documentation template provides a comprehensive guide for documenting your backend services. It includes authentication, endpoints, examples, and error handling patterns.

## 📋 Table of Contents
- [Authentication](#authentication)
- [Base URL](#base-url)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Endpoints](#endpoints)
- [Examples](#examples)
- [Rate Limiting](#rate-limiting)
- [Changelog](#changelog)

## 🔐 Authentication

### API Key Authentication
All API requests require a valid API key in the header:

```http
Authorization: Bearer YOUR_API_KEY_HERE
```

### JWT Authentication (Alternative)
For user-specific operations, use JWT tokens:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Getting a JWT Token:**
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

## 🌐 Base URL
```
Production: https://api.yourproject.com/v1
Development: http://localhost:3000/api/v1
```

## 📊 Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data here
  },
  "message": "Operation completed successfully",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided",
    "details": {
      "field": "email",
      "reason": "Invalid email format"
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## ❌ Error Handling

### HTTP Status Codes
| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Access denied |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### Error Codes
| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Input validation failed |
| `AUTH_REQUIRED` | Authentication required |
| `ACCESS_DENIED` | Insufficient permissions |
| `RESOURCE_NOT_FOUND` | Requested resource not found |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `SERVER_ERROR` | Internal server error |

## 📡 Endpoints

### 👤 Users

#### Get User Profile
```http
GET /users/profile
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "avatar": "https://example.com/avatar.jpg",
    "createdAt": "2024-01-01T00:00:00Z",
    "lastLogin": "2024-01-15T10:30:00Z"
  }
}
```

#### Update User Profile
```http
PUT /users/profile
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "John Smith",
  "avatar": "https://example.com/new-avatar.jpg"
}
```

### 📝 Tasks (Example Resource)

#### List Tasks
```http
GET /tasks?page=1&limit=10&status=pending&sort=createdAt:desc
Authorization: Bearer {token}
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `status` (optional): Filter by status (`pending`, `completed`, `cancelled`)
- `sort` (optional): Sort order (`createdAt:asc`, `createdAt:desc`, `priority:desc`)

**Response:**
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": "task_456",
        "title": "Complete API documentation",
        "description": "Write comprehensive API docs",
        "status": "pending",
        "priority": "high",
        "createdAt": "2024-01-15T09:00:00Z",
        "updatedAt": "2024-01-15T09:00:00Z",
        "dueDate": "2024-01-20T23:59:59Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3
    }
  }
}
```

#### Create Task
```http
POST /tasks
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "New task title",
  "description": "Task description",
  "priority": "medium",
  "dueDate": "2024-01-25T23:59:59Z"
}
```

#### Get Task by ID
```http
GET /tasks/{taskId}
Authorization: Bearer {token}
```

#### Update Task
```http
PUT /tasks/{taskId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Updated task title",
  "status": "completed"
}
```

#### Delete Task
```http
DELETE /tasks/{taskId}
Authorization: Bearer {token}
```

## 💡 Examples

### JavaScript/Fetch Example
```javascript
// Get user profile
async function getUserProfile() {
  try {
    const response = await fetch('https://api.yourproject.com/v1/users/profile', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer YOUR_JWT_TOKEN',
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    if (data.success) {
      console.log('User profile:', data.data);
    } else {
      console.error('Error:', data.error);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}

// Create new task
async function createTask(taskData) {
  try {
    const response = await fetch('https://api.yourproject.com/v1/tasks', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer YOUR_JWT_TOKEN',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(taskData)
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
}
```

### cURL Examples
```bash
# Get tasks with filtering
curl -X GET "https://api.yourproject.com/v1/tasks?status=pending&limit=5" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Create a new task
curl -X POST "https://api.yourproject.com/v1/tasks" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New task from cURL",
    "description": "Created via API",
    "priority": "high"
  }'

# Update task status
curl -X PUT "https://api.yourproject.com/v1/tasks/task_456" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed"
  }'
```

## 🚦 Rate Limiting

### Limits
- **Free tier**: 100 requests per hour
- **Premium tier**: 1000 requests per hour
- **Enterprise**: 10,000 requests per hour

### Headers
Rate limit information is included in response headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642261800
```

### Handling Rate Limits
When rate limit is exceeded, you'll receive a 429 status code:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Try again later.",
    "retryAfter": 3600
  }
}
```

## 🔄 Webhooks (Optional)

### Event Types
- `task.created` - New task created
- `task.updated` - Task updated
- `task.deleted` - Task deleted
- `user.profile_updated` - User profile updated

### Webhook Payload
```json
{
  "event": "task.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "id": "task_789",
    "title": "New task",
    "userId": "user_123"
  }
}
```

## 📝 Changelog

### v1.2.0 (2024-01-15)
- Added task priority filtering
- Improved error messages
- Added webhook support

### v1.1.0 (2024-01-01)
- Added pagination to task listing
- Implemented rate limiting
- Enhanced authentication

### v1.0.0 (2023-12-01)
- Initial API release
- Basic CRUD operations for tasks
- User authentication

## 📞 Support

For API support, please contact:
- **Email**: api-support@yourproject.com
- **Documentation**: https://docs.yourproject.com
- **Status Page**: https://status.yourproject.com

---

*Last updated: January 15, 2024*
*API Version: v1.2.0*