const fs = require('fs').promises;
const path = require('path');
const { ComplianceAssessment, ComplianceResult, ComplianceControl, Organization } = require('../models');
const { logger } = require('../logger');
let puppeteer = null;

// Lazy load puppeteer to avoid issues if not installed
try {
  puppeteer = require('puppeteer');
} catch (err) {
  logger.warn('Puppeteer not available - PDF generation disabled');
}

class ComplianceReportGenerator {
  constructor() {
    this.templatePath = path.join(__dirname, '../templates');
    this.outputPath = path.join(__dirname, '../reports');
  }

  /**
   * Initialize the report generator
   */
  async initialize() {
    try {
      // Ensure output directory exists
      await fs.mkdir(this.outputPath, { recursive: true });
      
      logger.info('Compliance report generator initialized');
    } catch (error) {
      logger.error('Failed to initialize report generator:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive compliance report
   */
  async generateReport(assessmentId, format = 'html', options = {}) {
    try {
      logger.info(`Generating ${format.toUpperCase()} report for assessment ${assessmentId}`);

      // Fetch assessment data with all related information
      const assessmentData = await this.fetchAssessmentData(assessmentId);
      
      if (!assessmentData) {
        throw new Error('Assessment not found or incomplete');
      }

      // Generate report based on format
      switch (format.toLowerCase()) {
        case 'html':
          return await this.generateHTMLReport(assessmentData, options);
        case 'json':
          return await this.generateJSONReport(assessmentData, options);
        case 'csv':
          return await this.generateCSVReport(assessmentData, options);
        case 'pdf':
          return await this.generatePDFReport(assessmentData, options);
        default:
          throw new Error(`Unsupported report format: ${format}`);
      }

    } catch (error) {
      logger.error(`Failed to generate ${format} report for assessment ${assessmentId}:`, error);
      throw error;
    }
  }

  /**
   * Generate executive summary report
   */
  async generateExecutiveSummary(assessmentId, options = {}) {
    try {
      const assessmentData = await this.fetchAssessmentData(assessmentId);
      
      if (!assessmentData) {
        throw new Error('Assessment not found');
      }

      const summary = {
        assessment: {
          id: assessmentData.assessment.id,
          name: assessmentData.assessment.name,
          organization: assessmentData.organization.name,
          type: assessmentData.assessment.assessment_type,
          completedAt: assessmentData.assessment.completed_at,
          duration: assessmentData.assessment.duration
        },
        scores: {
          overall: assessmentData.assessment.compliance_score,
          weighted: assessmentData.assessment.weighted_score,
          trend: this.calculateTrend(assessmentData)
        },
        statistics: {
          totalControls: assessmentData.assessment.total_controls,
          compliant: assessmentData.assessment.compliant_controls,
          nonCompliant: assessmentData.assessment.non_compliant_controls,
          manualReview: assessmentData.assessment.manual_review_controls,
          notApplicable: assessmentData.assessment.not_applicable_controls,
          errors: assessmentData.assessment.error_controls
        },
        criticalFindings: this.extractCriticalFindings(assessmentData),
        recommendations: this.generateRecommendations(assessmentData),
        complianceBySection: this.calculateSectionCompliance(assessmentData)
      };

      return {
        summary,
        filePath: await this.saveExecutiveSummary(summary, options)
      };

    } catch (error) {
      logger.error(`Failed to generate executive summary for assessment ${assessmentId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch complete assessment data
   */
  async fetchAssessmentData(assessmentId) {
    try {
      const assessment = await ComplianceAssessment.findByPk(assessmentId, {
        include: [
          {
            model: Organization,
            as: 'organization'
          }
        ]
      });

      if (!assessment) {
        return null;
      }

      // Fetch results with control details
      const results = await ComplianceResult.findAll({
        where: { assessment_id: assessmentId },
        include: [
          {
            model: ComplianceControl,
            as: 'control'
          }
        ],
        order: [
          [{ model: ComplianceControl, as: 'control' }, 'control_id', 'ASC']
        ]
      });

      return {
        assessment: assessment.toJSON(),
        organization: assessment.organization.toJSON(),
        results: results.map(r => r.toJSON())
      };

    } catch (error) {
      logger.error(`Error fetching assessment data for ${assessmentId}:`, error);
      throw error;
    }
  }

  /**
   * Generate HTML report
   */
  async generateHTMLReport(data, options = {}) {
    try {
      const reportHtml = this.buildHTMLReport(data, options);
      
      const fileName = `compliance_report_${data.assessment.id}_${Date.now()}.html`;
      const filePath = path.join(this.outputPath, fileName);
      
      await fs.writeFile(filePath, reportHtml, 'utf8');
      
      logger.info(`HTML report generated: ${fileName}`);
      
      return {
        format: 'html',
        fileName,
        filePath,
        size: (await fs.stat(filePath)).size
      };

    } catch (error) {
      logger.error('Error generating HTML report:', error);
      throw error;
    }
  }

  /**
   * Generate JSON report
   */
  async generateJSONReport(data, options = {}) {
    try {
      // Create comprehensive JSON report
      const reportData = {
        metadata: {
          generatedAt: new Date().toISOString(),
          format: 'json',
          version: '1.0.0',
          generator: 'MAES Compliance Reporter'
        },
        assessment: data.assessment,
        organization: data.organization,
        summary: {
          complianceScore: data.assessment.compliance_score,
          weightedScore: data.assessment.weighted_score,
          totalControls: data.assessment.total_controls,
          complianceBreakdown: {
            compliant: data.assessment.compliant_controls,
            nonCompliant: data.assessment.non_compliant_controls,
            manualReview: data.assessment.manual_review_controls,
            notApplicable: data.assessment.not_applicable_controls,
            errors: data.assessment.error_controls
          }
        },
        controlResults: data.results.map(result => ({
          controlId: result.control.control_id,
          section: result.control.section,
          title: result.control.title,
          description: result.control.description,
          severity: result.control.severity,
          weight: result.control.weight,
          status: result.status,
          score: result.score,
          actualResult: result.actual_result,
          expectedResult: result.expected_result,
          evidence: result.evidence,
          remediationGuidance: result.remediation_guidance,
          errorMessage: result.error_message,
          checkedAt: result.checked_at
        })),
        statistics: this.calculateDetailedStatistics(data),
        recommendations: this.generateRecommendations(data)
      };

      const fileName = `compliance_report_${data.assessment.id}_${Date.now()}.json`;
      const filePath = path.join(this.outputPath, fileName);
      
      await fs.writeFile(filePath, JSON.stringify(reportData, null, 2), 'utf8');
      
      logger.info(`JSON report generated: ${fileName}`);
      
      return {
        format: 'json',
        fileName,
        filePath,
        size: (await fs.stat(filePath)).size,
        data: reportData
      };

    } catch (error) {
      logger.error('Error generating JSON report:', error);
      throw error;
    }
  }

  /**
   * Generate CSV report
   */
  async generateCSVReport(data, options = {}) {
    try {
      const csvRows = [];
      
      // CSV Header
      csvRows.push([
        'Control ID',
        'Section', 
        'Title',
        'Severity',
        'Weight',
        'Status',
        'Score',
        'Remediation Guidance',
        'Error Message',
        'Checked At'
      ].join(','));

      // Data rows
      data.results.forEach(result => {
        const row = [
          `"${result.control.control_id}"`,
          `"${result.control.section}"`,
          `"${result.control.title.replace(/"/g, '""')}"`,
          `"${result.control.severity}"`,
          `"${result.control.weight}"`,
          `"${result.status}"`,
          `"${result.score || 0}"`,
          `"${(result.remediation_guidance || '').replace(/"/g, '""')}"`,
          `"${(result.error_message || '').replace(/"/g, '""')}"`,
          `"${result.checked_at}"`
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      
      const fileName = `compliance_report_${data.assessment.id}_${Date.now()}.csv`;
      const filePath = path.join(this.outputPath, fileName);
      
      await fs.writeFile(filePath, csvContent, 'utf8');
      
      logger.info(`CSV report generated: ${fileName}`);
      
      return {
        format: 'csv',
        fileName,
        filePath,
        size: (await fs.stat(filePath)).size
      };

    } catch (error) {
      logger.error('Error generating CSV report:', error);
      throw error;
    }
  }

  /**
   * Generate PDF report using Puppeteer
   */
  async generatePDFReport(data, options = {}) {
    if (!puppeteer) {
      // Fallback to HTML if puppeteer not available
      logger.warn('Puppeteer not available, generating HTML instead of PDF');
      const htmlReport = await this.generateHTMLReport(data, options);
      return {
        ...htmlReport,
        format: 'pdf',
        note: 'PDF generation unavailable - HTML generated instead'
      };
    }

    try {
      // First generate HTML content
      const htmlContent = this.buildHTMLReport(data, options);
      
      // Launch puppeteer
      const browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      
      const page = await browser.newPage();
      
      // Set content
      await page.setContent(htmlContent, { 
        waitUntil: 'networkidle0' 
      });
      
      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        },
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="font-size: 10px; text-align: center; width: 100%; margin: 0 20px;">
            <span>Compliance Assessment Report - ${data.assessment.name}</span>
          </div>
        `,
        footerTemplate: `
          <div style="font-size: 10px; display: flex; justify-content: space-between; width: 100%; margin: 0 20px;">
            <span>Generated: ${new Date().toLocaleDateString()}</span>
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
          </div>
        `
      });
      
      await browser.close();
      
      // Save PDF file
      const fileName = `compliance_report_${data.assessment.id}_${Date.now()}.pdf`;
      const filePath = path.join(this.outputPath, fileName);
      
      await fs.writeFile(filePath, pdfBuffer);
      
      logger.info(`PDF report generated: ${fileName}`);
      
      return {
        format: 'pdf',
        fileName,
        filePath,
        size: pdfBuffer.length
      };

    } catch (error) {
      logger.error('Error generating PDF report:', error);
      
      // Fallback to HTML
      logger.info('Falling back to HTML report due to PDF generation error');
      const htmlReport = await this.generateHTMLReport(data, options);
      return {
        ...htmlReport,
        format: 'pdf',
        note: 'PDF generation failed - HTML generated instead',
        error: error.message
      };
    }
  }

  /**
   * Build HTML report content
   */
  buildHTMLReport(data, options = {}) {
    const { assessment, organization, results } = data;
    
    const sectionStats = this.calculateSectionCompliance(data);
    const criticalFindings = this.extractCriticalFindings(data);
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Compliance Assessment Report - ${assessment.name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 3px solid #2196F3; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #2196F3; margin: 0; }
        .header .subtitle { color: #666; margin-top: 10px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #2196F3; }
        .summary-card h3 { margin: 0 0 10px 0; color: #333; }
        .summary-card .value { font-size: 2em; font-weight: bold; color: #2196F3; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .controls-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .controls-table th, .controls-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .controls-table th { background-color: #f8f9fa; font-weight: bold; }
        .status-compliant { color: #4CAF50; font-weight: bold; }
        .status-non-compliant { color: #f44336; font-weight: bold; }
        .status-manual-review { color: #FF9800; font-weight: bold; }
        .status-not-applicable { color: #757575; }
        .status-error { color: #f44336; font-style: italic; }
        .critical-findings { background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .recommendations { background: #d1ecf1; border: 1px solid #bee5eb; padding: 20px; border-radius: 8px; }
        .footer { margin-top: 40px; text-align: center; color: #666; font-size: 0.9em; }
        .progress-bar { width: 100%; height: 20px; background: #eee; border-radius: 10px; overflow: hidden; margin: 10px 0; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #4CAF50, #2196F3); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Compliance Assessment Report</h1>
            <div class="subtitle">
                Assessment: ${assessment.name}<br>
                Organization: ${organization.name}<br>
                Type: ${assessment.assessment_type.toUpperCase()}<br>
                Generated: ${new Date().toLocaleString()}
            </div>
        </div>

        <div class="summary-grid">
            <div class="summary-card">
                <h3>Overall Compliance Score</h3>
                <div class="value">${assessment.compliance_score}%</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${assessment.compliance_score}%"></div>
                </div>
            </div>
            <div class="summary-card">
                <h3>Weighted Score</h3>
                <div class="value">${assessment.weighted_score}%</div>
            </div>
            <div class="summary-card">
                <h3>Total Controls</h3>
                <div class="value">${assessment.total_controls}</div>
            </div>
            <div class="summary-card">
                <h3>Compliant</h3>
                <div class="value" style="color: #4CAF50;">${assessment.compliant_controls}</div>
            </div>
            <div class="summary-card">
                <h3>Non-Compliant</h3>
                <div class="value" style="color: #f44336;">${assessment.non_compliant_controls}</div>
            </div>
            <div class="summary-card">
                <h3>Manual Review</h3>
                <div class="value" style="color: #FF9800;">${assessment.manual_review_controls}</div>
            </div>
        </div>

        ${criticalFindings.length > 0 ? `
        <div class="section">
            <h2>Critical Findings</h2>
            <div class="critical-findings">
                <ul>
                    ${criticalFindings.map(finding => `<li><strong>${finding.control.control_id}</strong>: ${finding.control.title}</li>`).join('')}
                </ul>
            </div>
        </div>
        ` : ''}

        <div class="section">
            <h2>Compliance by Section</h2>
            ${Object.entries(sectionStats).map(([section, stats]) => `
                <div style="margin-bottom: 20px;">
                    <h4>${section}</h4>
                    <div style="display: flex; gap: 20px; align-items: center;">
                        <span>Score: <strong>${Math.round(stats.score)}%</strong></span>
                        <span>Controls: ${stats.compliant}/${stats.total}</span>
                        <div class="progress-bar" style="flex: 1; max-width: 300px;">
                            <div class="progress-fill" style="width: ${stats.score}%"></div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="section">
            <h2>Detailed Control Results</h2>
            <table class="controls-table">
                <thead>
                    <tr>
                        <th>Control ID</th>
                        <th>Section</th>
                        <th>Title</th>
                        <th>Severity</th>
                        <th>Status</th>
                        <th>Score</th>
                        <th>Remediation</th>
                    </tr>
                </thead>
                <tbody>
                    ${results.map(result => `
                        <tr>
                            <td><strong>${result.control.control_id}</strong></td>
                            <td>${result.control.section}</td>
                            <td>${result.control.title}</td>
                            <td>${result.control.severity}</td>
                            <td class="status-${result.status.replace('_', '-')}">${result.status.replace('_', ' ').toUpperCase()}</td>
                            <td>${result.score || 0}%</td>
                            <td>${result.remediation_guidance || 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>Recommendations</h2>
            <div class="recommendations">
                ${this.generateHTMLRecommendations(data)}
            </div>
        </div>

        <div class="footer">
            <p>Report generated by MAES Compliance Assessment System</p>
            <p>Assessment completed: ${new Date(assessment.completed_at).toLocaleString()}</p>
            <p>Duration: ${Math.floor(assessment.duration / 60)}m ${assessment.duration % 60}s</p>
        </div>
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Calculate section-wise compliance statistics
   */
  calculateSectionCompliance(data) {
    const sectionStats = {};
    
    data.results.forEach(result => {
      const section = result.control.section;
      
      if (!sectionStats[section]) {
        sectionStats[section] = {
          total: 0,
          compliant: 0,
          nonCompliant: 0,
          score: 0
        };
      }
      
      sectionStats[section].total++;
      
      if (result.status === 'compliant') {
        sectionStats[section].compliant++;
      } else if (result.status === 'non_compliant') {
        sectionStats[section].nonCompliant++;
      }
    });
    
    // Calculate scores
    Object.keys(sectionStats).forEach(section => {
      const stats = sectionStats[section];
      stats.score = stats.total > 0 ? (stats.compliant / stats.total) * 100 : 0;
    });
    
    return sectionStats;
  }

  /**
   * Extract critical findings (high severity non-compliant controls)
   */
  extractCriticalFindings(data) {
    return data.results.filter(result => 
      result.status === 'non_compliant' && 
      result.control.severity === 'level2'
    ).slice(0, 10); // Top 10 critical findings
  }

  /**
   * Generate recommendations based on assessment results
   */
  generateRecommendations(data) {
    const recommendations = [];
    
    // High-priority non-compliant controls
    const criticalIssues = this.extractCriticalFindings(data);
    if (criticalIssues.length > 0) {
      recommendations.push({
        priority: 'critical',
        title: 'Address Critical Security Controls',
        description: `${criticalIssues.length} Level 2 controls are non-compliant and require immediate attention`,
        action: 'Review and implement the remediation guidance for all Level 2 non-compliant controls'
      });
    }
    
    // Manual review items
    const manualReviewCount = data.assessment.manual_review_controls;
    if (manualReviewCount > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Complete Manual Reviews',
        description: `${manualReviewCount} controls require manual review to determine compliance status`,
        action: 'Schedule manual assessment of controls marked for review'
      });
    }
    
    // Overall score-based recommendations
    if (data.assessment.compliance_score < 70) {
      recommendations.push({
        priority: 'high',
        title: 'Improve Overall Compliance Posture',
        description: 'Overall compliance score is below recommended threshold of 70%',
        action: 'Develop a compliance improvement plan focusing on high-impact controls'
      });
    }
    
    return recommendations;
  }

  /**
   * Generate HTML recommendations
   */
  generateHTMLRecommendations(data) {
    const recommendations = this.generateRecommendations(data);
    
    if (recommendations.length === 0) {
      return '<p>No specific recommendations at this time. Continue monitoring compliance status regularly.</p>';
    }
    
    return recommendations.map(rec => `
      <div style="margin-bottom: 15px; padding: 15px; border-left: 4px solid ${
        rec.priority === 'critical' ? '#f44336' : 
        rec.priority === 'high' ? '#FF9800' : '#2196F3'
      }; background: #f9f9f9;">
        <h4 style="margin: 0 0 5px 0; color: ${
          rec.priority === 'critical' ? '#f44336' : 
          rec.priority === 'high' ? '#FF9800' : '#2196F3'
        };">
          ${rec.title} (${rec.priority.toUpperCase()})
        </h4>
        <p style="margin: 5px 0;"><strong>Issue:</strong> ${rec.description}</p>
        <p style="margin: 5px 0 0 0;"><strong>Recommended Action:</strong> ${rec.action}</p>
      </div>
    `).join('');
  }

  /**
   * Calculate detailed statistics
   */
  calculateDetailedStatistics(data) {
    const stats = {
      byStatus: {},
      bySeverity: {},
      bySection: {}
    };
    
    // Initialize counters
    ['compliant', 'non_compliant', 'manual_review', 'not_applicable', 'error'].forEach(status => {
      stats.byStatus[status] = 0;
    });
    
    ['level1', 'level2'].forEach(severity => {
      stats.bySeverity[severity] = { total: 0, compliant: 0, nonCompliant: 0 };
    });
    
    // Count results
    data.results.forEach(result => {
      // By status
      stats.byStatus[result.status]++;
      
      // By severity
      if (stats.bySeverity[result.control.severity]) {
        stats.bySeverity[result.control.severity].total++;
        if (result.status === 'compliant') {
          stats.bySeverity[result.control.severity].compliant++;
        } else if (result.status === 'non_compliant') {
          stats.bySeverity[result.control.severity].nonCompliant++;
        }
      }
      
      // By section
      const section = result.control.section;
      if (!stats.bySection[section]) {
        stats.bySection[section] = { total: 0, compliant: 0, nonCompliant: 0 };
      }
      stats.bySection[section].total++;
      if (result.status === 'compliant') {
        stats.bySection[section].compliant++;
      } else if (result.status === 'non_compliant') {
        stats.bySection[section].nonCompliant++;
      }
    });
    
    return stats;
  }

  /**
   * Calculate trend (placeholder - would compare with previous assessments)
   */
  calculateTrend(data) {
    // In a full implementation, this would compare with historical assessments
    return {
      direction: 'stable',
      change: 0,
      period: 'baseline'
    };
  }

  /**
   * Save executive summary
   */
  async saveExecutiveSummary(summary, options = {}) {
    try {
      const fileName = `executive_summary_${summary.assessment.id}_${Date.now()}.json`;
      const filePath = path.join(this.outputPath, fileName);
      
      await fs.writeFile(filePath, JSON.stringify(summary, null, 2), 'utf8');
      
      return filePath;
    } catch (error) {
      logger.error('Error saving executive summary:', error);
      throw error;
    }
  }

  /**
   * Clean up old reports
   */
  async cleanupOldReports(maxAgeMs = 30 * 24 * 60 * 60 * 1000) { // 30 days
    try {
      const files = await fs.readdir(this.outputPath);
      const now = Date.now();
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(this.outputPath, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAgeMs) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old report files`);
      }
      
      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up old reports:', error);
      return 0;
    }
  }
}

module.exports = new ComplianceReportGenerator();