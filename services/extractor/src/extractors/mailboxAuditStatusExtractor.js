const BaseExtractor = require('./baseExtractor');

class MailboxAuditStatusExtractor extends BaseExtractor {
  async extract(parameters) {
    // Graph provides partial mailbox settings; full audit config requires Exchange PowerShell
    const users = await this.graphClient.getAllPages('/users', {
      select: ['id', 'displayName', 'userPrincipalName', 'mail'],
      top: 500
    });

    const mailboxSettings = [];
    for (const user of users.slice(0, 200)) {
      try {
        const settings = await this.graphClient.getPage(
          `/users/${user.id || user.userPrincipalName}/mailboxSettings`
        );
        mailboxSettings.push({
          userPrincipalName: user.userPrincipalName,
          ...settings
        });
      } catch {
        // Skip users without mailbox
      }
    }

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('Mailbox_Settings.json', mailboxSettings)];
  }
}

module.exports = MailboxAuditStatusExtractor;