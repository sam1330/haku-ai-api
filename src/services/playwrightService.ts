import { chromium, Browser } from 'playwright';

let browser: Browser | undefined; // Global or singleton browser instance

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, // Path from Dockerfile
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
  }
  return browser;
}

async function generatePDF(
  resumeId: string,
  locale: string,
  authToken: string,
): Promise<Buffer> {
  const instance = await getBrowser();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  const context = await instance.newContext();

  try {
    await context.route('**/*', (route) => {
      const headers = {
        ...route.request().headers(),
        Authorization: `Bearer ${authToken}`,
      };
      route.continue({ headers });
    });

    const page = await context.newPage();

    // Navigate to Next.js print route
    await page.goto(`${frontendUrl}/${locale}/print/${resumeId}`, {
      waitUntil: 'networkidle', // Ensures images and fonts are loaded
    });

    // Generate the PDF as a buffer
    return await page.pdf({
      format: 'A4',
      printBackground: true, // Crucial for Tailwind colors and images
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
    });
  } finally {
    await context.close();
  }
}

module.exports = { generatePDF };
