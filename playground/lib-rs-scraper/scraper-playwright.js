/**
 * lib.rs Scraper
 *
 * Scrapes Rust crate information from lib.rs
 * Selectors sourced from Actionbook verified data
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';

// ============================================
// Selectors from Actionbook
// ============================================

const SELECTORS = {
  // Homepage selectors
  homepage: {
    totalCrateCount: 'header#home p',
    categoryCard: 'section#home-categories ul.cat > li',
    categoryTitle: 'div > a > h3, div > a > h4',
    categoryUrl: 'div > a',
    categoryDescription: 'div > a > span.desc',
    crateList: 'ul.crates > li > a:not(.more)',
    moreLink: 'ul.crates > li > a.more',
  },

  // Crate detail page selectors
  crateDetail: {
    name: 'header#package h2 span[property="name"]',
    description: 'p.desc',
    latestVersion: 'section#versions table tbody tr:first-child th',
    publishDate: 'section#versions table tbody tr:first-child td.date',
    downloadCount: 'section#downloads p b:first-child',
    categoryRanking: 'section#downloads p.top-n b',
    dependentCrates: 'section#downloads p a[href*="/rev"] b',
    license: 'section#license b[property="license"]',
    packageSize: 'section#sloc > p:nth-child(2)',
    sloc: 'section#sloc > p:nth-child(3)',
    authors: 'p.byline span.coowners a.owner span[property="name"]',
    categories: 'div.breadcrumbs span.categories a span[property="name"]',
    keywords: 'span.keywords a.keyword',
    labels: 'h2 span.labels span',
    apiDocsLink: 'header#package nav ul li a[property="softwareHelp"]',
    githubLink: 'header#package nav ul li a[property="url"]',
    readme: 'section#readme.readme',
    dependencies: 'section#deps nav > ul:not(.dev) li[property="requirements"]',
    devDependencies: 'section#deps ul.dev li',
    features: 'section#deps ul.features li a.feature',
  },

  // Category page selectors
  categoryPage: {
    crateItem: 'ul.crates > li',
    crateName: 'a[href^="/crates/"]',
    crateDescription: 'span.desc, p.desc',
  },
};

// ============================================
// Scraper Functions
// ============================================

/**
 * Scrape all categories from lib.rs homepage
 */
async function scrapeCategories(page) {
  console.log('Navigating to lib.rs homepage...');
  await page.goto('https://lib.rs/', { waitUntil: 'domcontentloaded' });

  // Get total crate count
  const totalText = await page.locator(SELECTORS.homepage.totalCrateCount).textContent();
  const totalMatch = totalText?.match(/(\d{1,3}(?:,\d{3})*)/);
  const totalCrates = totalMatch ? parseInt(totalMatch[1].replace(/,/g, '')) : 0;

  console.log(`Total crates indexed: ${totalCrates.toLocaleString()}`);

  // Get all categories
  const categories = [];
  const categoryCards = await page.locator(SELECTORS.homepage.categoryCard).all();

  for (const card of categoryCards) {
    const linkElement = card.locator(SELECTORS.homepage.categoryUrl);
    const titleElement = card.locator(SELECTORS.homepage.categoryTitle);
    const descElement = card.locator(SELECTORS.homepage.categoryDescription);

    const title = await titleElement.textContent().catch(() => null);
    const url = await linkElement.getAttribute('href').catch(() => null);
    const description = await descElement.textContent().catch(() => null);

    // Get featured crates
    const crateLinks = await card.locator(SELECTORS.homepage.crateList).all();
    const featuredCrates = [];

    for (const crateLink of crateLinks.slice(0, 10)) {
      const crateName = await crateLink.textContent();
      const crateUrl = await crateLink.getAttribute('href');
      const crateDesc = await crateLink.getAttribute('title');
      featuredCrates.push({
        name: crateName?.replace(/<wbr>/g, '').trim(),
        url: crateUrl,
        description: crateDesc,
      });
    }

    // Get "more" count
    const moreLink = card.locator(SELECTORS.homepage.moreLink);
    const moreText = await moreLink.textContent().catch(() => null);
    const moreMatch = moreText?.match(/(\d{1,3}(?:,\d{3})*)/);
    const totalInCategory = moreMatch ? parseInt(moreMatch[1].replace(/,/g, '')) : featuredCrates.length;

    if (title && url) {
      categories.push({
        title: title.trim(),
        url: `https://lib.rs${url}`,
        description: description?.trim(),
        totalCrates: totalInCategory,
        featuredCrates,
      });
    }
  }

  return { totalCrates, categories };
}

/**
 * Scrape crates from a category page
 */
async function scrapeCategoryPage(page, categoryUrl, maxPages = 5) {
  console.log(`Scraping category: ${categoryUrl}`);
  const crates = [];
  let currentPage = 1;

  while (currentPage <= maxPages) {
    const url = currentPage === 1 ? categoryUrl : `${categoryUrl}?page=${currentPage}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const crateItems = await page.locator(SELECTORS.categoryPage.crateItem).all();

    if (crateItems.length === 0) break;

    for (const item of crateItems) {
      const nameLink = item.locator(SELECTORS.categoryPage.crateName).first();
      const name = await nameLink.textContent().catch(() => null);
      const url = await nameLink.getAttribute('href').catch(() => null);
      const description = await item.locator(SELECTORS.categoryPage.crateDescription).first().textContent().catch(() => null);

      if (name && url) {
        crates.push({
          name: name.replace(/<wbr>/g, '').trim(),
          url: `https://lib.rs${url}`,
          description: description?.trim(),
        });
      }
    }

    console.log(`  Page ${currentPage}: found ${crateItems.length} crates`);
    currentPage++;

    // Check if there's a next page
    const hasNextPage = await page.locator('a[rel="next"]').count() > 0;
    if (!hasNextPage) break;
  }

  return crates;
}

/**
 * Scrape detailed information for a specific crate
 */
async function scrapeCrateDetail(page, crateName) {
  const url = `https://lib.rs/crates/${crateName}`;
  console.log(`Scraping crate detail: ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const sel = SELECTORS.crateDetail;

  // Helper function for safe text extraction with timeout
  const getText = async (selector, timeout = 5000) => {
    try {
      const el = page.locator(selector).first();
      const count = await el.count();
      if (count === 0) return null;
      return (await el.textContent({ timeout }))?.trim() || null;
    } catch {
      return null;
    }
  };

  const getAttr = async (selector, attr, timeout = 5000) => {
    try {
      const el = page.locator(selector).first();
      const count = await el.count();
      if (count === 0) return null;
      return await el.getAttribute(attr, { timeout });
    } catch {
      return null;
    }
  };

  const getAllText = async (selector, timeout = 5000) => {
    try {
      const elements = await page.locator(selector).all();
      return Promise.all(elements.map(el => el.textContent({ timeout }).then(t => t?.trim()).catch(() => null)));
    } catch {
      return [];
    }
  };

  // Extract basic info
  const name = await getText(sel.name);
  const description = await getText(sel.description);
  const latestVersion = await getText(sel.latestVersion);
  const publishDate = await getText(sel.publishDate);
  const license = await getText(sel.license);
  const packageSize = await getText(sel.packageSize);
  const sloc = await getText(sel.sloc);

  // Extract metrics
  const downloadText = await getText(sel.downloadCount);
  const downloads = downloadText ? parseInt(downloadText.replace(/,/g, '')) : null;

  const rankText = await getText(sel.categoryRanking);
  const categoryRanking = rankText ? parseInt(rankText) : null;

  const dependentText = await getText(sel.dependentCrates);
  const dependentCrates = dependentText ? parseInt(dependentText.replace(/,/g, '')) : null;

  // Extract arrays
  const authors = await getAllText(sel.authors);
  const categories = await getAllText(sel.categories);
  const keywords = (await getAllText(sel.keywords)).map(k => k?.replace('#', ''));
  const labels = await getAllText(sel.labels);

  // Extract links
  const apiDocsUrl = await getAttr(sel.apiDocsLink, 'href');
  const githubUrl = await getAttr(sel.githubLink, 'href');

  // Extract dependencies
  const depElements = await page.locator(sel.dependencies).all();
  const dependencies = [];
  for (const dep of depElements) {
    const depName = await dep.locator('a[href^="/crates/"] b').textContent().catch(() => null);
    const version = await dep.locator('a[href^="/crates/"]').getAttribute('title').catch(() => null);
    const isOptional = await dep.locator('.optional, a.feature').count() > 0;
    if (depName) {
      dependencies.push({ name: depName.trim(), version, optional: isOptional });
    }
  }

  // Extract features
  const features = await getAllText(sel.features);

  // Extract README HTML (skip if not found quickly)
  let readmeHtml = null;
  try {
    const readmeEl = page.locator(sel.readme).first();
    if (await readmeEl.count() > 0) {
      readmeHtml = await readmeEl.innerHTML({ timeout: 5000 });
    }
  } catch {
    // README not found or timeout
  }

  return {
    name,
    description,
    latestVersion: latestVersion?.replace('new', '').trim(),
    publishDate,
    license,
    packageSize,
    sloc,
    downloads,
    categoryRanking,
    dependentCrates,
    authors: authors.filter(Boolean),
    categories: categories.filter(Boolean),
    keywords: keywords.filter(Boolean),
    labels: labels.filter(Boolean),
    links: {
      librs: url,
      apiDocs: apiDocsUrl,
      github: githubUrl,
    },
    dependencies,
    features: features.filter(Boolean),
    readmeHtml,
  };
}

// ============================================
// Main CLI
// ============================================

async function main() {
  const command = process.argv[2] || 'categories';
  const arg = process.argv[3];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });
  const page = await context.newPage();

  try {
    let result;
    let outputFile;

    switch (command) {
      case 'categories':
        result = await scrapeCategories(page);
        outputFile = 'categories.json';
        console.log(`\nFound ${result.categories.length} categories`);
        break;

      case 'crates':
        if (!arg) {
          console.log('Usage: node scraper.js crates <category-url>');
          console.log('Example: node scraper.js crates https://lib.rs/rust-patterns');
          process.exit(1);
        }
        result = await scrapeCategoryPage(page, arg);
        outputFile = 'crates.json';
        console.log(`\nFound ${result.length} crates`);
        break;

      case 'detail':
        if (!arg) {
          console.log('Usage: node scraper.js detail <crate-name>');
          console.log('Example: node scraper.js detail tokio');
          process.exit(1);
        }
        result = await scrapeCrateDetail(page, arg);
        outputFile = `crate-${arg}.json`;
        console.log(`\nScraped details for: ${result.name}`);
        break;

      default:
        console.log('Available commands:');
        console.log('  categories  - Scrape all categories from homepage');
        console.log('  crates      - Scrape crates from a category page');
        console.log('  detail      - Scrape detailed info for a specific crate');
        process.exit(1);
    }

    // Save result
    await fs.writeFile(outputFile, JSON.stringify(result, null, 2));
    console.log(`Results saved to: ${outputFile}`);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
