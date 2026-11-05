function logError(context, error) {
  // Prisma messages can contain submitted values, including credentials and keys.
  const code = /^P\d{4}$/.test(error?.code) ? error.code : "UNEXPECTED_ERROR";
  console.error(context, code);
}

module.exports = logError;
