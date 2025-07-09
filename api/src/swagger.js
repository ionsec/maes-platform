const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MAES API - M365 Analyzer & Extractor Suite',
      version: '1.0.0',
      description: 'Comprehensive API for Microsoft 365 forensic analysis and data extraction',
      contact: {
        name: 'IONSEC.IO Dev Team',
        url: 'https://github.com/ionsec/maes-platform',
        email: 'dev@ionsec.io'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.maes.local',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            details: {
              type: 'array',
              items: {
                type: 'object'
              },
              description: 'Validation error details'
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            username: {
              type: 'string'
            },
            email: {
              type: 'string',
              format: 'email'
            },
            firstName: {
              type: 'string'
            },
            lastName: {
              type: 'string'
            },
            role: {
              type: 'string',
              enum: ['admin', 'analyst', 'viewer']
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            organization: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  format: 'uuid'
                },
                name: {
                  type: 'string'
                },
                tenantId: {
                  type: 'string'
                },
                isActive: {
                  type: 'boolean'
                }
              }
            }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: {
              type: 'string',
              description: 'Username or email'
            },
            password: {
              type: 'string',
              description: 'Password (min 6 characters)'
            }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean'
            },
            token: {
              type: 'string',
              description: 'JWT token'
            },
            user: {
              $ref: '#/components/schemas/User'
            }
          }
        },
        Extraction: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            type: {
              type: 'string',
              enum: ['unified_audit_log', 'azure_signin_logs', 'azure_audit_logs', 'mfa_status', 'oauth_permissions', 'risky_users', 'mailbox_audit', 'message_trace', 'devices']
            },
            status: {
              type: 'string',
              enum: ['pending', 'running', 'completed', 'failed', 'cancelled']
            },
            startDate: {
              type: 'string',
              format: 'date'
            },
            endDate: {
              type: 'string',
              format: 'date'
            },
            itemsExtracted: {
              type: 'integer'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        AnalysisJob: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            type: {
              type: 'string',
              enum: ['ual_analysis', 'signin_analysis', 'audit_analysis', 'mfa_analysis', 'oauth_analysis', 'risky_detection_analysis', 'risky_user_analysis', 'message_trace_analysis', 'device_analysis', 'comprehensive_analysis']
            },
            status: {
              type: 'string',
              enum: ['pending', 'running', 'completed', 'failed', 'cancelled']
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical']
            },
            extractionId: {
              type: 'string',
              format: 'uuid'
            },
            parameters: {
              type: 'object'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Alert: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            title: {
              type: 'string'
            },
            description: {
              type: 'string'
            },
            severity: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical']
            },
            category: {
              type: 'string',
              enum: ['authentication', 'authorization', 'data_access', 'configuration', 'malware', 'policy_violation']
            },
            status: {
              type: 'string',
              enum: ['new', 'investigating', 'resolved', 'false_positive']
            },
            mitreTechniques: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            affectedEntities: {
              type: 'array',
              items: {
                type: 'object'
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Report: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            name: {
              type: 'string'
            },
            type: {
              type: 'string',
              enum: ['executive_summary', 'incident_report', 'compliance_report', 'threat_analysis', 'user_activity', 'system_health', 'custom']
            },
            format: {
              type: 'string',
              enum: ['pdf', 'docx', 'xlsx', 'html', 'json']
            },
            status: {
              type: 'string',
              enum: ['pending', 'generating', 'completed', 'failed']
            },
            parameters: {
              type: 'object'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Organization: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            name: {
              type: 'string'
            },
            tenantId: {
              type: 'string'
            },
            isActive: {
              type: 'boolean'
            },
            settings: {
              type: 'object'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            total: {
              type: 'integer'
            },
            page: {
              type: 'integer'
            },
            pages: {
              type: 'integer'
            },
            limit: {
              type: 'integer'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.js']
};

const specs = swaggerJsdoc(options);

module.exports = specs; 