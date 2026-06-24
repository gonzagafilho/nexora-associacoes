function getActiveLogoUrl(branding = {}) {
  if (branding.logoUseProcessed && branding.logoProcessedPath) return branding.logoProcessedPath;
  if (branding.logoOriginalPath) return branding.logoOriginalPath;
  return branding.logoUrl || "";
}

function toSafeBranding(branding = null) {
  const source = branding?.toObject ? branding.toObject() : (branding || {});
  return {
    ...source,
    activeLogoUrl: getActiveLogoUrl(source)
  };
}

module.exports = { getActiveLogoUrl, toSafeBranding };
