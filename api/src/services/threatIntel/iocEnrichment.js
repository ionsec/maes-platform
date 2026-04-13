const axios = require('axios');
const { logger } = require('../../utils/logger');

/**
 * Threat Intelligence - IOC Enrichment Service
 * Enriches indicators of compromise (IPs, domains, hashes) with threat intel
 */

class IOCEnrichmentService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 3600000; // 1 hour
    this.providers = {
      virustotal: { enabled: false, apiKey: null },
      abuseipdb: { enabled: false, apiKey: null },
      shodan: { enabled: false, apiKey: null },
      ipqualityscore: { enabled: false, apiKey: null }
    };
    
    this.initializeProviders();
  }

  initializeProviders() {
    if (process.env.VIRUSTOTAL_API_KEY) {
      this.providers.virustotal.enabled = true;
      this.providers.virustotal.apiKey = process.env.VIRUSTOTAL_API_KEY;
    }
    if (process.env.ABUSEIPDB_API_KEY) {
      this.providers.abuseipdb.enabled = true;
      this.providers.abuseipdb.apiKey = process.env.ABUSEIPDB_API_KEY;
    }
    if (process.env.SHODAN_API_KEY) {
      this.providers.shodan.enabled = true;
      this.providers.shodan.apiKey = process.env.SHODAN_API_KEY;
    }
    if (process.env.IPQUALITYSCORE_API_KEY) {
      this.providers.ipqualityscore.enabled = true;
      this.providers.ipqualityscore.apiKey = process.env.IPQUALITYSCORE_API_KEY;
    }
  }

  /**
   * Enrich IP address
   */
  async enrichIP(ip) {
    const cacheKey = `ip:${ip}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const results = {
      ip,
      type: 'ip',
      risk_score: 0,
      providers_checked: [],
      findings: [],
      metadata: {}
    };

    // Check AbuseIPDB
    if (this.providers.abuseipdb.enabled) {
      try {
        const abuseResult = await this.checkAbuseIPDB(ip);
        results.providers_checked.push('abuseipdb');
        
        if (abuseResult) {
          results.findings.push({
            provider: 'abuseipdb',
            type: 'reputation',
            severity: abuseResult.abuseConfidenceScore > 80 ? 'high' : 
                      abuseResult.abuseConfidenceScore > 50 ? 'medium' : 'low',
            data: abuseResult
          });
          
          results.risk_score += abuseResult.abuseConfidenceScore;
          results.metadata.abuseReports = abuseResult.totalReports;
          results.metadata.lastReported = abuseResult.lastReportedAt;
        }
      } catch (error) {
        logger.warn('AbuseIPDB check failed:', error.message);
      }
    }

    // Check Shodan
    if (this.providers.shodan.enabled) {
      try {
        const shodanResult = await this.checkShodan(ip);
        results.providers_checked.push('shodan');
        
        if (shodanResult) {
          results.findings.push({
            provider: 'shodan',
            type: 'exposure',
            severity: shodanResult.vulns?.length > 0 ? 'high' : 'info',
            data: {
              ports: shodanResult.ports,
              os: shodanResult.os,
              vulns: shodanResult.vulns,
              services: shodanResult.data?.map(s => s.port + '/' + s.transport)
            }
          });
          
          if (shodanResult.vulns?.length > 0) {
            results.risk_score += Math.min(shodanResult.vulns.length * 10, 50);
          }
        }
      } catch (error) {
        logger.warn('Shodan check failed:', error.message);
      }
    }

    // Normalize risk score
    results.risk_score = Math.min(results.risk_score, 100);
    results.risk_level = this.getRiskLevel(results.risk_score);

    this.addToCache(cacheKey, results);
    return results;
  }

  /**
   * Enrich domain
   */
  async enrichDomain(domain) {
    const cacheKey = `domain:${domain}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const results = {
      domain,
      type: 'domain',
      risk_score: 0,
      providers_checked: [],
      findings: [],
      metadata: {}
    };

    // Check VirusTotal
    if (this.providers.virustotal.enabled) {
      try {
        const vtResult = await this.checkVirusTotalDomain(domain);
        results.providers_checked.push('virustotal');
        
        if (vtResult) {
          const malicious = vtResult.data?.attributes?.last_analysis_stats?.malicious || 0;
          const suspicious = vtResult.data?.attributes?.last_analysis_stats?.suspicious || 0;
          
          results.findings.push({
            provider: 'virustotal',
            type: 'reputation',
            severity: malicious > 5 ? 'critical' : malicious > 2 ? 'high' : 'medium',
            data: {
              malicious,
              suspicious,
              total_engines: vtResult.data?.attributes?.last_analysis_stats?.total
            }
          });
          
          results.risk_score += (malicious * 10) + (suspicious * 5);
        }
      } catch (error) {
        logger.warn('VirusTotal domain check failed:', error.message);
      }
    }

    results.risk_score = Math.min(results.risk_score, 100);
    results.risk_level = this.getRiskLevel(results.risk_score);

    this.addToCache(cacheKey, results);
    return results;
  }

  /**
   * Enrich file hash (MD5, SHA1, SHA256)
   */
  async enrichHash(hash, hashType = 'sha256') {
    const cacheKey = `hash:${hash}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const results = {
      hash,
      type: 'hash',
      hash_type: hashType,
      risk_score: 0,
      providers_checked: [],
      findings: [],
      metadata: {}
    };

    // Check VirusTotal
    if (this.providers.virustotal.enabled) {
      try {
        const vtResult = await this.checkVirusTotalHash(hash, hashType);
        results.providers_checked.push('virustotal');
        
        if (vtResult) {
          const malicious = vtResult.data?.attributes?.last_analysis_stats?.malicious || 0;
          const suspicious = vtResult.data?.attributes?.last_analysis_stats?.suspicious || 0;
          
          results.findings.push({
            provider: 'virustotal',
            type: 'malware',
            severity: malicious > 5 ? 'critical' : malicious > 2 ? 'high' : 'medium',
            data: {
              malicious,
              suspicious,
              detection_names: vtResult.data?.attributes?.last_analysis_results,
              first_seen: vtResult.data?.attributes?.first_submission_date,
              last_seen: vtResult.data?.attributes?.last_analysis_date
            }
          });
          
          results.risk_score += (malicious * 10) + (suspicious * 5);
          
          // Get malware family if detected
          if (malicious > 0) {
            const sigma = vtResult.data?.attributes?.sigma_analysis_stats?.high?.sigma;
            if (sigma) {
              results.metadata.malware_family = sigma;
            }
          }
        }
      } catch (error) {
        logger.warn('VirusTotal hash check failed:', error.message);
      }
    }

    results.risk_score = Math.min(results.risk_score, 100);
    results.risk_level = this.getRiskLevel(results.risk_score);

    this.addToCache(cacheKey, results);
    return results;
  }

  /**
   * Bulk enrich multiple IOCs
   */
  async bulkEnrich(iocs) {
    const results = {
      ips: [],
      domains: [],
      hashes: [],
      summary: {
        total: iocs.length,
        high_risk: 0,
        medium_risk: 0,
        low_risk: 0,
        clean: 0
      }
    };

    for (const ioc of iocs) {
      let result;
      
      if (this.isIP(ioc.value)) {
        result = await this.enrichIP(ioc.value);
        results.ips.push(result);
      } else if (this.isDomain(ioc.value)) {
        result = await this.enrichDomain(ioc.value);
        results.domains.push(result);
      } else if (this.isHash(ioc.value)) {
        result = await this.enrichHash(ioc.value, ioc.type || 'sha256');
        results.hashes.push(result);
      }

      if (result) {
        if (result.risk_score >= 70) results.summary.high_risk++;
        else if (result.risk_score >= 40) results.summary.medium_risk++;
        else if (result.risk_score >= 20) results.summary.low_risk++;
        else results.summary.clean++;
      }
    }

    return results;
  }

  // Helper methods for API calls
  async checkAbuseIPDB(ip) {
    const response = await axios.get('https://api.abuseipdb.com/api/v2/check', {
      headers: { 'Key': this.providers.abuseipdb.apiKey },
      params: { ipAddress: ip, maxAgeInDays: 90 }
    });
    return response.data?.data;
  }

  async checkShodan(ip) {
    const response = await axios.get(`https://api.shodan.io/shodan/host/${ip}`, {
      params: { key: this.providers.shodan.apiKey }
    });
    return response.data;
  }

  async checkVirusTotalDomain(domain) {
    const response = await axios.get(
      `https://www.virustotal.com/api/v3/domains/${domain}`,
      { headers: { 'x-apikey': this.providers.virustotal.apiKey } }
    );
    return response.data;
  }

  async checkVirusTotalHash(hash, hashType) {
    const response = await axios.get(
      `https://www.virustotal.com/api/v3/files/${hash}`,
      { headers: { 'x-apikey': this.providers.virustotal.apiKey } }
    );
    return response.data;
  }

  // Utility methods
  isIP(value) {
    return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(value);
  }

  isDomain(value) {
    return /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/.test(value);
  }

  isHash(value) {
    return /^[a-fA-F0-9]{32}$/.test(value) || // MD5
           /^[a-fA-F0-9]{40}$/.test(value) || // SHA1
           /^[a-fA-F0-9]{64}$/.test(value);   // SHA256
  }

  getRiskLevel(score) {
    if (score >= 70) return 'critical';
    if (score >= 40) return 'high';
    if (score >= 20) return 'medium';
    if (score > 0) return 'low';
    return 'clean';
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  addToCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
    
    // Cleanup old entries
    if (this.cache.size > 1000) {
      const now = Date.now();
      for (const [k, v] of this.cache.entries()) {
        if (now - v.timestamp > this.cacheTTL) {
          this.cache.delete(k);
        }
      }
    }
  }
}

module.exports = new IOCEnrichmentService();
