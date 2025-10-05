import { TwitterApi } from 'twitter-api-v2';

let twitterClient: TwitterApi | null = null;

export function initTwitterClient() {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    console.warn('⚠️ Twitter API credentials not configured. Auto-tweets disabled.');
    return null;
  }

  try {
    twitterClient = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken: accessToken,
      accessSecret: accessSecret,
    });
    console.log('✅ Twitter API client initialized');
    return twitterClient;
  } catch (error) {
    console.error('❌ Failed to initialize Twitter client:', error);
    return null;
  }
}

interface TokenLaunchData {
  name: string;
  symbol: string;
  creator: string;
  address: string;
  initialPrice: string;
}

export async function postTokenLaunchTweet(data: TokenLaunchData): Promise<boolean> {
  if (!twitterClient) {
    console.log('ℹ️ Twitter client not initialized, skipping tweet');
    return false;
  }

  try {
    // Determine base URL based on environment
    let baseUrl: string;
    
    if (process.env.NODE_ENV === 'production') {
      // In production, check for REPLIT_DOMAINS (Replit Deployments)
      const replitDomains = process.env.REPLIT_DOMAINS;
      
      if (replitDomains) {
        // REPLIT_DOMAINS can be JSON or string depending on deployment type
        try {
          const domains = JSON.parse(replitDomains);
          baseUrl = `https://${domains.deploy || 'basedmem.replit.app'}`;
        } catch {
          // If it's a plain string (single domain), use it
          baseUrl = `https://${replitDomains}`;
        }
      } else {
        // Fallback to known production domain
        baseUrl = 'https://basedmem.replit.app';
      }
    } else {
      // Development - use REPLIT_DEV_DOMAIN or localhost
      baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : 'http://localhost:5000';
    }
    
    const tokenUrl = `${baseUrl}/token/${data.address}`;
    
    console.log('🔗 Generated token URL for cast:', tokenUrl);

    const tweetText = `🚀 New Token Launch!

🪙 ${data.symbol} (${data.name})
👤 Creator: @${data.creator}
💰 Initial Price: ${data.initialPrice} ETH
📊 Bonding Curve: Active

Start trading now! 👉 ${tokenUrl}

#BasedMem #Base #MemeCoins`;

    const tweet = await twitterClient.v2.tweet(tweetText);
    console.log('✅ Tweet posted successfully:', tweet.data.id);
    return true;
  } catch (error) {
    console.error('❌ Failed to post tweet:', error);
    return false;
  }
}
