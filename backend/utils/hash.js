const crypto = require('crypto');

const HASH_ALGORITHM = 'sha256';
const PBKDF2_ITERATIONS = 310000;
const PBKDF2_KEY_LENGTH = 32;
function createPbkdf2Hash(password, salt = crypto.randomBytes(16).toString('hex')) {
    const derived = crypto
        .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, HASH_ALGORITHM)
        .toString('hex');
    return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${derived}`;
}

function isLegacySha256Hash(hash) {
    return typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash);
}

function hashPassword(password) {
    if (typeof password !== 'string' || password.length === 0) {
        throw new Error('Password must be a non-empty string');
    }
    return createPbkdf2Hash(password);
}

function verifyPassword(password, storedHash) {
    if (typeof storedHash !== 'string' || storedHash.length === 0) {
        return false;
    }

    if (storedHash.startsWith('pbkdf2$')) {
        const [, iterationStr, salt, derived] = storedHash.split('$');
        const iterations = Number.parseInt(iterationStr, 10);
        if (!salt || !derived || !Number.isFinite(iterations)) {
            return false;
        }
        const candidate = crypto
            .pbkdf2Sync(password, salt, iterations, Buffer.from(derived, 'hex').length, HASH_ALGORITHM)
            .toString('hex');
        return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(derived, 'hex'));
    }

    if (isLegacySha256Hash(storedHash)) {
        const candidate = crypto.createHash(HASH_ALGORITHM).update(password).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(storedHash, 'hex'));
    }

    return false;
}

function needsHashMigration(storedHash) {
    return isLegacySha256Hash(storedHash);
}

module.exports = {
    hashPassword,
    verifyPassword,
    needsHashMigration
};
