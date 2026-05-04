const BaseExtractor = require('./baseExtractor');

class DevicesExtractor extends BaseExtractor {
  async extract(parameters) {
    const [entraDevices, managedDevices] = await Promise.all([
      this.graphClient.getAllPages('/devices', {
        select: ['id', 'deviceId', 'displayName', 'accountEnabled', 'approximateLastSignInDateTime',
          'deviceCategory', 'deviceOwnership', 'deviceMetadata', 'deviceVersion', 'isCompliant',
          'isManaged', 'manufacturer', 'model', 'operatingSystem', 'operatingSystemVersion',
          'trustType', 'registrationDateTime'],
        top: 500
      }),
      this.graphClient.getAllPages('/deviceManagement/managedDevices', {
        select: ['id', 'userId', 'deviceName', 'managedDeviceOwnerType', 'enrolledDateTime',
          'lastSyncDateTime', 'operatingSystem', 'complianceState', 'jailBroken',
          'managementAgent', 'osVersion', 'serialNumber', 'manufacturer', 'model',
          'deviceType', 'azureADRegistered', 'azureADDeviceId'],
        top: 500
      })
    ]);

    await this.progressTracker.updatePhase('writing');

    return [
      await this.writeJson('Entra_Devices.json', entraDevices),
      await this.writeJson('Intune_ManagedDevices.json', managedDevices)
    ];
  }
}

module.exports = DevicesExtractor;