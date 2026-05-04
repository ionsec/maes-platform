const BaseExtractor = require('./baseExtractor');

class MailboxPermissionsExtractor extends BaseExtractor {
  async extract(parameters) {
    // No direct Graph API for mailbox permissions.
    // Best effort: use mailboxSettings + user details as a partial view.
    // Full mailbox permissions require Exchange PowerShell (Tier 3 fallback).

    const users = await this.graphClient.getAllPages('/users', {
      select: ['id', 'displayName', 'userPrincipalName', 'mail'],
      top: 500
    });

    const mailboxDetails = [];
    for (const user of users.slice(0, 200)) {
      try {
        const [settings, folders] = await Promise.all([
          this.graphClient.getPage(`/users/${user.id || user.userPrincipalName}/mailboxSettings`),
          this.graphClient.getAllPages(`/users/${user.id || user.userPrincipalName}/mailFolders`, {
            select: ['id', 'displayName', 'totalItemCount', 'unreadItemCount'],
            top: 20
          })
        ]);
        mailboxDetails.push({
          userPrincipalName: user.userPrincipalName,
          mailboxSettings: settings,
          mailFolders: folders
        });
      } catch {
        // Skip
      }
    }

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('Mailbox_Details.json', mailboxDetails)];
  }
}

module.exports = MailboxPermissionsExtractor;