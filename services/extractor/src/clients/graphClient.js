const { logger } = require('../logger');

class GraphClientWrapper {
  /**
   * @param {Client} graphClient - Authenticated Microsoft Graph client
   * @param {Object} [options]
   * @param {number} [options.maxRetries=5] - Max retries for rate-limited requests
   * @param {number} [options.baseDelay=30] - Base delay in seconds for exponential backoff
   * @param {Function} [options.onProgress] - Callback for progress updates
   */
  constructor(graphClient, options = {}) {
    this.client = graphClient;
    this.maxRetries = options.maxRetries || 5;
    this.baseDelay = options.baseDelay || 30;
    this.onProgress = options.onProgress || null;
  }

  /**
   * Fetch all pages of a Graph API endpoint using @odata.nextLink.
   *
   * @param {string} endpoint - Graph API path (e.g., '/auditLogs/signIns')
   * @param {Object} [options]
   * @param {string[]} [options.select] - Fields to select
   * @param {string} [options.filter] - OData filter
   * @param {string} [options.orderby] - Order by clause
   * @param {number} [options.top] - Page size
   * @param {Object} [options.headers] - Additional headers
   * @returns {Object[]} All results across all pages
   */
  async getAllPages(endpoint, options = {}) {
    const allResults = [];
    let url = endpoint;
    let pageCount = 0;

    // Build initial request with query params
    let request = this.client.api(url);
    if (options.select) request = request.select(options.select.join(','));
    if (options.filter) request = request.filter(options.filter);
    if (options.orderby) request = request.orderby(options.orderby);
    if (options.top) request = request.top(options.top);
    if (options.headers) request = request.headers(options.headers);

    while (url) {
      const response = await this._requestWithRetry(() => {
        const req = url === endpoint ? request : this.client.api(url);
        return req.get();
      });

      if (response.value) {
        allResults.push(...response.value);
      } else if (Array.isArray(response)) {
        // Some endpoints return arrays directly
        allResults.push(...response);
      }

      pageCount++;
      if (this.onProgress) {
        this.onProgress({ fetched: allResults.length, page: pageCount, endpoint });
      }

      url = response['@odata.nextLink'] || null;
      if (url) {
        // nextLink is a full URL; we'll use it directly in the next iteration
        logger.debug(`Paginating ${endpoint}: page ${pageCount}, ${allResults.length} records so far`);
      }
    }

    logger.info(`Completed pagination for ${endpoint}: ${allResults.length} total records across ${pageCount} pages`);
    return allResults;
  }

  /**
   * Fetch a single page from a Graph API endpoint.
   *
   * @param {string} endpoint - Graph API path
   * @param {Object} [options] - Same as getAllPages options
   * @returns {Object} The raw API response (may contain @odata.nextLink)
   */
  async getPage(endpoint, options = {}) {
    let request = this.client.api(endpoint);
    if (options.select) request = request.select(options.select.join(','));
    if (options.filter) request = request.filter(options.filter);
    if (options.orderby) request = request.orderby(options.orderby);
    if (options.top) request = request.top(options.top);
    if (options.headers) request = request.headers(options.headers);

    return this._requestWithRetry(() => request.get());
  }

  /**
   * Execute a request with automatic retry on rate limiting (429) and service unavailable (503).
   *
   * @param {Function} requestFn - Async function that performs the Graph API request
   * @returns {Object} The API response
   */
  async _requestWithRetry(requestFn) {
    let retryCount = 0;

    while (retryCount < this.maxRetries) {
      try {
        return await requestFn();
      } catch (error) {
        const statusCode = error.statusCode || error.code || 0;

        if (statusCode === 429 || statusCode === 503) {
          retryCount++;
          const retryAfter = error.headers
            ? parseInt(error.headers['Retry-After'] || error.headers['retry-after'] || '0', 10)
            : 0;

          const delay = retryAfter > 0
            ? retryAfter
            : this.baseDelay * Math.pow(2, retryCount - 1) + Math.random() * 10;

          logger.warn(`Rate limit hit (${statusCode}), retry ${retryCount}/${this.maxRetries} after ${delay.toFixed(1)}s`);
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        } else {
          throw error;
        }
      }
    }

    throw new Error(`Max retries (${this.maxRetries}) exceeded for rate-limited request`);
  }
}

module.exports = GraphClientWrapper;