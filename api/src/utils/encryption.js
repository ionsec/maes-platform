const crypto = require('crypto');

// Use environment variable for encryption key or generate a default one
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-character-secret-key-here!';
const ALGORITHM = 'aes-256-cbc';

// Generate a proper 32-byte key from the string
const getKey = () => {
  return crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
};

class EncryptionUtil {
  static encrypt(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    try {
      const iv = crypto.randomBytes(16);
      const key = getKey();
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return {
        encrypted,
        iv: iv.toString('hex')
      };
    } catch (error) {
      console.error('Encryption error:', error);
      return text; // Return unencrypted for now
    }
  }

  static decrypt(encryptedData) {
    if (!encryptedData || typeof encryptedData === 'string') {
      return encryptedData;
    }

    try {
      const { encrypted, iv } = encryptedData;
      
      const key = getKey();
      const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      // If decryption fails, return original data (for backward compatibility)
      return encryptedData;
    }
  }

  static encryptCredentials(credentials) {
    if (!credentials || typeof credentials !== 'object') {
      return credentials;
    }

    const encrypted = {};
    
    // Encrypt sensitive fields
    const sensitiveFields = ['applicationId', 'clientSecret', 'certificateThumbprint'];
    
    for (const [key, value] of Object.entries(credentials)) {
      if (sensitiveFields.includes(key) && value) {
        encrypted[key] = this.encrypt(value);
      } else {
        encrypted[key] = value;
      }
    }
    
    return encrypted;
  }

  static decryptCredentials(encryptedCredentials) {
    if (!encryptedCredentials || typeof encryptedCredentials !== 'object') {
      return encryptedCredentials;
    }

    const decrypted = {};
    
    // Decrypt sensitive fields
    const sensitiveFields = ['applicationId', 'clientSecret', 'certificateThumbprint'];
    
    for (const [key, value] of Object.entries(encryptedCredentials)) {
      if (sensitiveFields.includes(key) && value) {
        decrypted[key] = this.decrypt(value);
      } else {
        decrypted[key] = value;
      }
    }
    
    return decrypted;
  }
}

module.exports = EncryptionUtil;