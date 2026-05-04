const forge = require('node-forge');
const crypto = require('crypto');
const fs = require('fs').promises;
const fsSync = require('fs');
const { logger } = require('../logger');

/**
 * Parse a PFX/PKCS12 certificate buffer and extract key details.
 * Replaces the PowerShell-based certificate validation previously used.
 *
 * @param {Buffer} pfxBuffer - Raw PFX file contents
 * @param {string} [password=''] - PFX password
 * @returns {{ privateKeyPem: string, certificatePem: string, thumbprint: string, subject: string, issuer: string, notBefore: Date, notAfter: Date, hasExpired: boolean, hasPrivateKey: boolean }}
 */
function parsePfxCertificate(pfxBuffer, password = '') {
  const passwordStr = password || '';
  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passwordStr);

  // Extract private key
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShrappedKeyBag });
  const pkcs8Bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShrappedKeyBag });
  const keyBagsFallback = p12.getBags({ bagType: forge.pki.oids.keyBag });

  let privateKey = null;
  for (const bagType of [keyBags, pkcs8Bags, keyBagsFallback]) {
    const bags = bagType[Object.keys(bagType)[0]];
    if (bags && bags.length > 0 && bags[0].key) {
      privateKey = bags[0].key;
      break;
    }
  }

  // Extract certificate
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBagArray = certBags[Object.keys(certBags)[0]];
  if (!certBagArray || certBagArray.length === 0) {
    throw new Error('No certificate found in PFX file');
  }
  const certificate = certBagArray[0].cert;

  // Calculate thumbprint (SHA-1 of DER-encoded certificate)
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  const thumbprint = crypto.createHash('sha1').update(certDer, 'binary').digest('hex').toUpperCase();

  // Build subject/issuer strings
  const subject = certificate.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', ');
  const issuer = certificate.issuer.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', ');

  const notBefore = certificate.validity.notBefore;
  const notAfter = certificate.validity.notAfter;
  const hasExpired = notAfter < new Date();

  return {
    privateKeyPem: privateKey ? forge.pki.privateKeyToPem(privateKey) : null,
    certificatePem: certificate ? forge.pki.certificateToPem(certificate) : null,
    certificateBase64: certificate
      ? forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).toBase64()
      : null,
    thumbprint,
    subject,
    issuer,
    notBefore,
    notAfter,
    hasExpired,
    hasPrivateKey: privateKey !== null
  };
}

/**
 * Validate an uploaded PFX certificate file.
 * Used by the API service certificate upload endpoint.
 *
 * @param {string} filePath - Path to the uploaded PFX file
 * @param {string} password - PFX password
 * @returns {{ thumbprint: string, subject: string, issuer: string, notBefore: Date, notAfter: Date, hasExpired: boolean }}
 */
function validatePfxCertificate(filePath, password) {
  const certBuffer = fsSync.readFileSync(filePath);
  const result = parsePfxCertificate(certBuffer, password);

  if (!result.hasPrivateKey) {
    throw new Error('Certificate does not contain a private key');
  }

  if (result.hasExpired) {
    throw new Error(`Certificate has expired on ${result.notAfter.toISOString()}`);
  }

  logger.info('Certificate validated successfully:', {
    thumbprint: result.thumbprint,
    subject: result.subject
  });

  return result;
}

/**
 * Load a PFX certificate from disk and return parsed details
 * along with MSAL-compatible auth parameters.
 *
 * @param {string} pfxPath - Path to the PFX file
 * @param {string} password - PFX password
 * @returns {{ thumbprint: string, privateKey: string, x5c: string, subject: string, notAfter: Date }}
 */
async function loadPfxForAuth(pfxPath, password) {
  const certBuffer = await fs.readFile(pfxPath);
  const parsed = parsePfxCertificate(certBuffer, password);

  if (!parsed.hasPrivateKey) {
    throw new Error('Certificate does not contain a private key required for authentication');
  }

  if (parsed.hasExpired) {
    throw new Error(`Certificate expired on ${parsed.notAfter.toISOString()}. Please upload a valid certificate.`);
  }

  return {
    thumbprint: parsed.thumbprint,
    privateKey: parsed.privateKeyPem,
    x5c: parsed.certificateBase64,
    subject: parsed.subject,
    notAfter: parsed.notAfter
  };
}

module.exports = {
  parsePfxCertificate,
  validatePfxCertificate,
  loadPfxForAuth
};