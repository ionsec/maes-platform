const { Client } = require('@elastic/elasticsearch');
const { logger } = require('../utils/logger');

class ElasticsearchService {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const elasticsearchUrl = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
      
      this.client = new Client({
        node: elasticsearchUrl,
        maxRetries: 3,
        requestTimeout: 10000,
        sniffOnStart: false
      });

      // Test connection
      await this.client.ping();
      logger.info('Elasticsearch connection established');

      // Initialize indices
      await this.initializeIndices();
      
      this.initialized = true;
      logger.info('Elasticsearch service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Elasticsearch service:', error);
      throw error;
    }
  }

  async initializeIndices() {
    const indices = [
      {
        name: 'maes-audit-logs',
        mapping: this.getAuditLogsMapping()
      },
      {
        name: 'maes-alerts',
        mapping: this.getAlertsMapping()
      },
      {
        name: 'maes-extractions',
        mapping: this.getExtractionsMapping()
      },
      {
        name: 'maes-analysis-jobs',
        mapping: this.getAnalysisJobsMapping()
      }
    ];

    for (const index of indices) {
      await this.createIndexIfNotExists(index.name, index.mapping);
    }
  }

  async createIndexIfNotExists(indexName, mapping) {
    try {
      const exists = await this.client.indices.exists({ index: indexName });
      
      if (!exists) {
        await this.client.indices.create({
          index: indexName,
          body: {
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0,
              analysis: {
                analyzer: {
                  text_analyzer: {
                    type: 'custom',
                    tokenizer: 'standard',
                    filter: ['lowercase', 'stop', 'snowball']
                  }
                }
              }
            },
            mappings: mapping
          }
        });
        logger.info(`Created Elasticsearch index: ${indexName}`);
      }
    } catch (error) {
      logger.error(`Failed to create index ${indexName}:`, error);
      throw error;
    }
  }

  getAuditLogsMapping() {
    return {
      properties: {
        '@timestamp': { type: 'date' },
        organization_id: { type: 'keyword' },
        user_id: { type: 'keyword' },
        action: { type: 'keyword' },
        category: { type: 'keyword' },
        resource: { type: 'keyword' },
        resource_id: { type: 'keyword' },
        ip_address: { type: 'ip' },
        user_agent: { type: 'text', analyzer: 'text_analyzer' },
        request_method: { type: 'keyword' },
        request_path: { type: 'text' },
        status_code: { type: 'integer' },
        duration: { type: 'integer' },
        details: { type: 'object', dynamic: true },
        metadata: { type: 'object', dynamic: true }
      }
    };
  }

  getAlertsMapping() {
    return {
      properties: {
        '@timestamp': { type: 'date' },
        organization_id: { type: 'keyword' },
        severity: { type: 'keyword' },
        type: { type: 'keyword' },
        category: { type: 'keyword' },
        title: { type: 'text', analyzer: 'text_analyzer' },
        description: { type: 'text', analyzer: 'text_analyzer' },
        status: { type: 'keyword' },
        source: { type: 'object', dynamic: true },
        affected_entities: { type: 'object', dynamic: true },
        evidence: { type: 'object', dynamic: true },
        mitre_attack: { type: 'object', dynamic: true },
        recommendations: { type: 'object', dynamic: true },
        tags: { type: 'keyword' },
        metadata: { type: 'object', dynamic: true }
      }
    };
  }

  getExtractionsMapping() {
    return {
      properties: {
        '@timestamp': { type: 'date' },
        organization_id: { type: 'keyword' },
        type: { type: 'keyword' },
        status: { type: 'keyword' },
        priority: { type: 'keyword' },
        start_date: { type: 'date' },
        end_date: { type: 'date' },
        progress: { type: 'integer' },
        items_extracted: { type: 'integer' },
        parameters: { type: 'object', dynamic: true },
        output_files: { type: 'object', dynamic: true },
        statistics: { type: 'object', dynamic: true },
        metadata: { type: 'object', dynamic: true }
      }
    };
  }

  getAnalysisJobsMapping() {
    return {
      properties: {
        '@timestamp': { type: 'date' },
        organization_id: { type: 'keyword' },
        extraction_id: { type: 'keyword' },
        type: { type: 'keyword' },
        status: { type: 'keyword' },
        priority: { type: 'keyword' },
        progress: { type: 'integer' },
        parameters: { type: 'object', dynamic: true },
        results: { type: 'object', dynamic: true },
        alerts: { type: 'object', dynamic: true },
        output_files: { type: 'object', dynamic: true },
        metadata: { type: 'object', dynamic: true }
      }
    };
  }

  // Index audit log
  async indexAuditLog(auditLog) {
    try {
      const document = {
        '@timestamp': auditLog.created_at,
        organization_id: auditLog.organization_id,
        user_id: auditLog.user_id,
        action: auditLog.action,
        category: auditLog.category,
        resource: auditLog.resource,
        resource_id: auditLog.resource_id,
        ip_address: auditLog.ip_address,
        user_agent: auditLog.user_agent,
        request_method: auditLog.request_method,
        request_path: auditLog.request_path,
        status_code: auditLog.status_code,
        duration: auditLog.duration,
        details: auditLog.details,
        metadata: auditLog.metadata
      };

      await this.client.index({
        index: 'maes-audit-logs',
        body: document
      });

      logger.debug(`Indexed audit log: ${auditLog.id}`);
    } catch (error) {
      logger.error('Failed to index audit log:', error);
      throw error;
    }
  }

  // Index alert
  async indexAlert(alert) {
    try {
      const document = {
        '@timestamp': alert.created_at,
        organization_id: alert.organization_id,
        severity: alert.severity,
        type: alert.type,
        category: alert.category,
        title: alert.title,
        description: alert.description,
        status: alert.status,
        source: alert.source,
        affected_entities: alert.affected_entities,
        evidence: alert.evidence,
        mitre_attack: alert.mitre_attack,
        recommendations: alert.recommendations,
        tags: alert.tags,
        metadata: alert.metadata
      };

      await this.client.index({
        index: 'maes-alerts',
        body: document
      });

      logger.debug(`Indexed alert: ${alert.id}`);
    } catch (error) {
      logger.error('Failed to index alert:', error);
      throw error;
    }
  }

  // Index extraction
  async indexExtraction(extraction) {
    try {
      const document = {
        '@timestamp': extraction.created_at,
        organization_id: extraction.organization_id,
        type: extraction.type,
        status: extraction.status,
        priority: extraction.priority,
        start_date: extraction.start_date,
        end_date: extraction.end_date,
        progress: extraction.progress,
        items_extracted: extraction.items_extracted,
        parameters: extraction.parameters,
        output_files: extraction.output_files,
        statistics: extraction.statistics,
        metadata: extraction.metadata
      };

      await this.client.index({
        index: 'maes-extractions',
        body: document
      });

      logger.debug(`Indexed extraction: ${extraction.id}`);
    } catch (error) {
      logger.error('Failed to index extraction:', error);
      throw error;
    }
  }

  // Index analysis job
  async indexAnalysisJob(analysisJob) {
    try {
      const document = {
        '@timestamp': analysisJob.created_at,
        organization_id: analysisJob.organization_id,
        extraction_id: analysisJob.extraction_id,
        type: analysisJob.type,
        status: analysisJob.status,
        priority: analysisJob.priority,
        progress: analysisJob.progress,
        parameters: analysisJob.parameters,
        results: analysisJob.results,
        alerts: analysisJob.alerts,
        output_files: analysisJob.output_files,
        metadata: analysisJob.metadata
      };

      await this.client.index({
        index: 'maes-analysis-jobs',
        body: document
      });

      logger.debug(`Indexed analysis job: ${analysisJob.id}`);
    } catch (error) {
      logger.error('Failed to index analysis job:', error);
      throw error;
    }
  }

  // Search audit logs
  async searchAuditLogs(query, filters = {}, size = 100, from = 0) {
    try {
      const searchBody = {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: query,
                  fields: ['action', 'category', 'resource', 'request_path'],
                  type: 'best_fields',
                  fuzziness: 'AUTO'
                }
              }
            ],
            filter: []
          }
        },
        sort: [{ '@timestamp': { order: 'desc' } }],
        size: size,
        from: from
      };

      // Add filters
      if (filters.organization_id) {
        searchBody.query.bool.filter.push({
          term: { organization_id: filters.organization_id }
        });
      }

      if (filters.category) {
        searchBody.query.bool.filter.push({
          term: { category: filters.category }
        });
      }

      if (filters.date_range) {
        searchBody.query.bool.filter.push({
          range: {
            '@timestamp': {
              gte: filters.date_range.start,
              lte: filters.date_range.end
            }
          }
        });
      }

      const response = await this.client.search({
        index: 'maes-audit-logs',
        body: searchBody
      });

      return {
        hits: response.hits.hits.map(hit => ({
          id: hit._id,
          score: hit._score,
          ...hit._source
        })),
        total: response.hits.total.value,
        took: response.took
      };
    } catch (error) {
      logger.error('Failed to search audit logs:', error);
      throw error;
    }
  }

  // Search alerts
  async searchAlerts(query, filters = {}, size = 100, from = 0) {
    try {
      const searchBody = {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: query,
                  fields: ['title', 'description', 'category', 'type'],
                  type: 'best_fields',
                  fuzziness: 'AUTO'
                }
              }
            ],
            filter: []
          }
        },
        sort: [{ '@timestamp': { order: 'desc' } }],
        size: size,
        from: from
      };

      // Add filters
      if (filters.organization_id) {
        searchBody.query.bool.filter.push({
          term: { organization_id: filters.organization_id }
        });
      }

      if (filters.severity) {
        searchBody.query.bool.filter.push({
          term: { severity: filters.severity }
        });
      }

      if (filters.status) {
        searchBody.query.bool.filter.push({
          term: { status: filters.status }
        });
      }

      if (filters.date_range) {
        searchBody.query.bool.filter.push({
          range: {
            '@timestamp': {
              gte: filters.date_range.start,
              lte: filters.date_range.end
            }
          }
        });
      }

      const response = await this.client.search({
        index: 'maes-alerts',
        body: searchBody
      });

      return {
        hits: response.hits.hits.map(hit => ({
          id: hit._id,
          score: hit._score,
          ...hit._source
        })),
        total: response.hits.total.value,
        took: response.took
      };
    } catch (error) {
      logger.error('Failed to search alerts:', error);
      throw error;
    }
  }

  // Get analytics
  async getAnalytics(organizationId, dateRange) {
    try {
      const analytics = {};

      // Audit logs analytics
      const auditLogsAggs = await this.client.search({
        index: 'maes-audit-logs',
        body: {
          query: {
            bool: {
              filter: [
                { term: { organization_id: organizationId } },
                {
                  range: {
                    '@timestamp': {
                      gte: dateRange.start,
                      lte: dateRange.end
                    }
                  }
                }
              ]
            }
          },
          aggs: {
            actions_over_time: {
              date_histogram: {
                field: '@timestamp',
                calendar_interval: '1d'
              }
            },
            top_actions: {
              terms: {
                field: 'action',
                size: 10
              }
            },
            top_categories: {
              terms: {
                field: 'category',
                size: 10
              }
            }
          }
        }
      });

      analytics.auditLogs = {
        total: auditLogsAggs.hits.total.value,
        actionsOverTime: auditLogsAggs.aggregations.actions_over_time.buckets,
        topActions: auditLogsAggs.aggregations.top_actions.buckets,
        topCategories: auditLogsAggs.aggregations.top_categories.buckets
      };

      // Alerts analytics
      const alertsAggs = await this.client.search({
        index: 'maes-alerts',
        body: {
          query: {
            bool: {
              filter: [
                { term: { organization_id: organizationId } },
                {
                  range: {
                    '@timestamp': {
                      gte: dateRange.start,
                      lte: dateRange.end
                    }
                  }
                }
              ]
            }
          },
          aggs: {
            alerts_over_time: {
              date_histogram: {
                field: '@timestamp',
                calendar_interval: '1d'
              }
            },
            alerts_by_severity: {
              terms: {
                field: 'severity',
                size: 5
              }
            },
            alerts_by_category: {
              terms: {
                field: 'category',
                size: 10
              }
            }
          }
        }
      });

      analytics.alerts = {
        total: alertsAggs.hits.total.value,
        alertsOverTime: alertsAggs.aggregations.alerts_over_time.buckets,
        alertsBySeverity: alertsAggs.aggregations.alerts_by_severity.buckets,
        alertsByCategory: alertsAggs.aggregations.alerts_by_category.buckets
      };

      return analytics;
    } catch (error) {
      logger.error('Failed to get analytics:', error);
      throw error;
    }
  }

  // Bulk index documents
  async bulkIndex(documents, indexName) {
    try {
      const operations = [];
      
      for (const doc of documents) {
        operations.push({ index: { _index: indexName } });
        operations.push(doc);
      }

      if (operations.length > 0) {
        const response = await this.client.bulk({ body: operations });
        
        if (response.errors) {
          const errors = response.items.filter(item => item.index.error);
          logger.error('Bulk indexing errors:', errors);
        }

        logger.info(`Bulk indexed ${documents.length} documents to ${indexName}`);
      }
    } catch (error) {
      logger.error('Failed to bulk index documents:', error);
      throw error;
    }
  }
}

module.exports = new ElasticsearchService(); 