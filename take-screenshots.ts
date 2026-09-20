import { chromium } from 'playwright';

async function takeScreenshots() {
  console.log('🚀 Starting screenshot capture...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  const baseUrl = 'http://localhost:5000';
  
  try {
    // 1. Homepage
    console.log('📸 Screenshot 1: Homepage');
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: 'attached_assets/screenshots/01-homepage.png',
      fullPage: false
    });
    
    // 2. Guide page overview
    console.log('📸 Screenshot 2: Guide page');
    await page.goto(`${baseUrl}/how-to-use`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: 'attached_assets/screenshots/02-guide-page.png',
      fullPage: true
    });
    
    // 3. Connect Wallet button closeup
    console.log('📸 Screenshot 3: Connect Wallet button');
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const connectButton = page.locator('button:has-text("Connect Wallet")').first();
    if (await connectButton.isVisible()) {
      await connectButton.screenshot({ 
        path: 'attached_assets/screenshots/03-connect-wallet-button.png'
      });
    }
    
    // 4. Limit Orders page
    console.log('📸 Screenshot 4: Limit Orders page');
    await page.goto(`${baseUrl}/limit-orders`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.screenshot({ 
      path: 'attached_assets/screenshots/04-limit-orders-page.png',
      fullPage: false
    });
    
    // 5. Vault Panel (if visible without wallet)
    console.log('📸 Screenshot 5: Vault Panel area');
    await page.waitForTimeout(1000);
    const vaultPanel = page.locator('text=Vault Balance').first();
    if (await vaultPanel.isVisible({ timeout: 3000 }).catch(() => false)) {
      const vaultCard = vaultPanel.locator('..').locator('..');
      await vaultCard.screenshot({ 
        path: 'attached_assets/screenshots/05-vault-panel.png'
      });
    } else {
      // Take full page if vault not found
      await page.screenshot({ 
        path: 'attached_assets/screenshots/05-limit-orders-top.png',
        fullPage: false
      });
    }
    
    // 6. Navigation bar closeup
    console.log('📸 Screenshot 6: Navigation bar');
    const nav = page.locator('nav').first();
    if (await nav.isVisible()) {
      await nav.screenshot({ 
        path: 'attached_assets/screenshots/06-navigation-bar.png'
      });
    }
    
    // 7. Browse page (for token examples)
    console.log('📸 Screenshot 7: Browse page');
    await page.goto(`${baseUrl}/browse`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: 'attached_assets/screenshots/07-browse-tokens.png',
      fullPage: false
    });
    
    // 8. Swap page
    console.log('📸 Screenshot 8: Swap page');
    await page.goto(`${baseUrl}/swap`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: 'attached_assets/screenshots/08-swap-page.png',
      fullPage: false
    });
    
    console.log('✅ All screenshots captured!');
    console.log('📂 Saved to: attached_assets/screenshots/');
    
  } catch (error) {
    console.error('❌ Error taking screenshots:', error);
  } finally {
    await browser.close();
  }
}

takeScreenshots().catch(console.error);
