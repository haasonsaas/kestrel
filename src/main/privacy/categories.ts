// Pre-built privacy category domain lists
// Based on common sensitive domain categories

export interface PrivacyCategory {
  id: string
  name: string
  description: string
  domains: string[]
}

export const PRIVACY_CATEGORIES: PrivacyCategory[] = [
  {
    id: 'adult',
    name: 'Adult Content',
    description: 'Adult websites and mature content',
    domains: ['pornhub.com', 'xvideos.com', 'xhamster.com', 'xnxx.com', 'redtube.com', 'youporn.com']
  },
  {
    id: 'banking',
    name: 'Banking & Finance',
    description: 'Bank accounts, financial transactions, and investment platforms',
    domains: [
      'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com',
      'capitalone.com', 'usbank.com', 'schwab.com', 'fidelity.com',
      'vanguard.com', 'robinhood.com', 'coinbase.com', 'binance.com',
      'paypal.com', 'venmo.com', 'wise.com', 'revolut.com',
      'mint.com', 'plaid.com', 'stripe.com'
    ]
  },
  {
    id: 'health',
    name: 'Health & Medical',
    description: 'Medical records, health information, and healthcare providers',
    domains: [
      'myChart.com', 'patient.info', 'webmd.com', 'mayoclinic.org',
      'healthline.com', 'zocdoc.com', 'teladoc.com', 'goodrx.com',
      'express-scripts.com', 'cvs.com', 'walgreens.com',
      'anthem.com', 'unitedhealth.com', 'aetna.com', 'cigna.com'
    ]
  },
  {
    id: 'social',
    name: 'Social Media',
    description: 'Social media platforms and messaging services',
    domains: [
      'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
      'tiktok.com', 'snapchat.com', 'reddit.com', 'tumblr.com',
      'pinterest.com', 'linkedin.com', 'threads.net',
      'messenger.com', 'whatsapp.com', 'telegram.org', 'signal.org'
    ]
  },
  {
    id: 'shopping',
    name: 'Shopping',
    description: 'E-commerce sites and online shopping platforms',
    domains: [
      'amazon.com', 'ebay.com', 'walmart.com', 'target.com',
      'bestbuy.com', 'etsy.com', 'shopify.com', 'aliexpress.com',
      'wish.com', 'wayfair.com', 'costco.com', 'homedepot.com'
    ]
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    description: 'Streaming services, games, and entertainment platforms',
    domains: [
      'netflix.com', 'hulu.com', 'disneyplus.com', 'hbomax.com',
      'primevideo.com', 'youtube.com', 'twitch.tv', 'spotify.com',
      'apple.com/tv', 'peacocktv.com', 'crunchyroll.com',
      'steampowered.com', 'epicgames.com', 'roblox.com'
    ]
  }
]

// Default excluded domains (always excluded for security)
export const ALWAYS_EXCLUDED_DOMAINS = [
  // Password managers
  '1password.com',
  'bitwarden.com',
  'lastpass.com',
  'dashlane.com',
  'keepersecurity.com',
  'enpass.io',
  // Banking
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'paypal.com',
  'venmo.com',
  // Crypto
  'coinbase.com',
  'binance.com',
  'metamask.io',
  // Auth / SSO
  'accounts.google.com',
  'login.microsoftonline.com',
  'auth0.com',
  'okta.com',
]

// Default excluded apps (always excluded — native apps with sensitive data)
export const ALWAYS_EXCLUDED_APPS = [
  'com.1password.1password',
  'com.agilebits.onepassword7',
  'com.bitwarden.desktop',
  'com.lastpass.LastPass',
  'com.dashlane.dashlanephonefinal',
  'com.keepersecurity.keeper',
  'com.enpass.Enpass',
  'com.apple.keychainaccess',
]
