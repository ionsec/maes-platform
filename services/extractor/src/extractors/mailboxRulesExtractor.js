const BaseExtractor = require('./baseExtractor');

class MailboxRulesExtractor extends BaseExtractor {
  async extract(parameters) {
    // Get all users first, then inbox rules for each
    const users = await this.graphClient.getAllPages('/users', {
      select: ['id', 'displayName', 'userPrincipalName', 'mail'],
      top: 500
    });

    const allRules = [];
    for (const user of users.slice(0, 200)) {
      try {
        const rules = await this.graphClient.getAllPages(
          `/users/${user.id || user.userPrincipalName}/mailFolders/inbox/messageRules`,
          { top: 100 }
        );
        for (const rule of rules) {
          allRules.push({ ...rule, _user: user.userPrincipalName });
        }
      } catch {
        // Skip users without mailbox or access
      }
    }

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('Mailbox_InboxRules.json', allRules)];
  }
}

module.exports = MailboxRulesExtractor;