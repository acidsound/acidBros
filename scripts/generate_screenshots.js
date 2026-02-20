const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function main() {
    // Start http-server with 127.0.0.1 to avoid potential localhost resolution issues
    const server = spawn('npx', ['-y', 'http-server', '-p', '8080', '-a', '127.0.0.1'], {
        stdio: 'inherit',
        shell: true
    });

    const baseUrl = 'http://127.0.0.1:8080';

    // Wait for server to start by polling
    console.log(`Waiting for server at ${baseUrl}...`);
    let serverReady = false;
    for (let i = 0; i < 20; i++) {
        try {
            const probeBrowser = await chromium.launch();
            const probePage = await probeBrowser.newPage();
            await probePage.goto(baseUrl, { timeout: 2000 });
            await probeBrowser.close();
            serverReady = true;
            console.log('Server is ready!');
            break;
        } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    if (!serverReady) {
        console.error('Server failed to start');
        server.kill();
        process.exit(1);
    }

    const browser = await chromium.launch();

    try {
        const assetsDir = path.join(__dirname, '..', 'assets');
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir);
        }

        console.log('Taking Desktop Screenshot...');
        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 }
        });
        const page = await context.newPage();
        await page.goto(baseUrl);

        // Wait for UI to be fully rendered
        console.log('Waiting for UI elements...');
        await page.waitForSelector('.step-303', { timeout: 10000 });
        await page.waitForSelector('.step-909', { timeout: 10000 });
        await page.waitForSelector('.rotary-knob', { timeout: 10000 });

        // Extra time for any final layouts/animations
        await page.waitForTimeout(2000);

        await page.screenshot({ path: path.join(assetsDir, 'screenshot-desktop.png') });

        console.log('Taking Mobile Landscape Screenshot...');
        // iPhone 13 Pro Landscape
        const mobileLandscape = devices['iPhone 13 Pro'];
        const contextLandscape = await browser.newContext({
            ...mobileLandscape,
            viewport: { width: 844, height: 390 },
            isMobile: true
        });
        const pageLandscape = await contextLandscape.newPage();
        await pageLandscape.goto(baseUrl);
        await pageLandscape.waitForSelector('.step-303', { timeout: 10000 });
        await pageLandscape.waitForTimeout(2000);
        await pageLandscape.screenshot({ path: path.join(assetsDir, 'screenshot-mobile-landscape.png') });
        await contextLandscape.close();

        console.log('Taking Mobile Portrait Screenshot...');
        const mobilePortrait = devices['iPhone 13 Pro'];
        const contextPortrait = await browser.newContext({
            ...mobilePortrait,
            isMobile: true
        });
        const pagePortrait = await contextPortrait.newPage();
        await pagePortrait.goto(baseUrl);
        await pagePortrait.waitForSelector('.step-303', { timeout: 10000 });
        await pagePortrait.waitForTimeout(2000);
        await pagePortrait.screenshot({ path: path.join(assetsDir, 'screenshot-mobile-portrait.png') });
        await contextPortrait.close();

        // --- Manual Screenshots ---
        console.log('Taking Manual Screenshots...');
        await page.setViewportSize({ width: 1280, height: 1200 }); // Larger height to fit everything
        await page.reload();
        await page.waitForSelector('.step-303', { timeout: 10000 });
        await page.waitForTimeout(2000);

        // 1. Transport
        const transport = page.locator('.top-bar');
        await transport.screenshot({ path: path.join(assetsDir, 'manual-transport.png') });

        // 2. Mode Switch
        const modeSwitch = page.locator('.mode-switch-group');
        await modeSwitch.screenshot({ path: path.join(assetsDir, 'manual-mode-switch.png') });

        // 3. Copy/Paste Buttons
        // In Pattern Mode
        const patternActions = page.locator('.pattern-actions');
        await patternActions.screenshot({ path: path.join(assetsDir, 'manual-copy-paste.png') });

        // 4. TB-303 Unit
        const tb303 = page.locator('.machine.tb-303').first();
        await tb303.screenshot({ path: path.join(assetsDir, 'manual-tb303.png') });

        // 5. TR-909 Unit
        const tr909 = page.locator('.machine.tr-909');
        await tr909.screenshot({ path: path.join(assetsDir, 'manual-tr909.png') });

        // 6. Piano Roll
        // The piano roll is now an inline element toggled by the piano button in the unit header.
        await page.click('#pianoToggle303_1');

        // Wait for inline piano roll
        try {
            await page.waitForSelector('.note-editor', { state: 'visible', timeout: 3000 });
            await page.waitForTimeout(500); // Allow any animation to finish

            // Screenshot the entire TB-303 unit again now that the piano is visible
            const tb303WithPiano = page.locator('.machine.tb-303').first();
            await tb303WithPiano.screenshot({ path: path.join(assetsDir, 'manual-pianoroll.png') });

            // Close it
            await page.click('#pianoToggle303_1');
        } catch (e) {
            console.log('Could not open inline piano roll or take screenshot: ' + e);
        }

        // 7. Settings
        await page.click('#settingsBtn');
        await page.waitForSelector('#settingsPopover', { state: 'visible' });
        await page.waitForTimeout(500);
        const settingsPopover = page.locator('#settingsPopover');
        await settingsPopover.screenshot({ path: path.join(assetsDir, 'manual-settings.png') });

        // Close settings
        await page.click('#settingsCloseBtn');
        await page.waitForTimeout(500);

        // --- How to add new screenshots ---
        // 1. Inspect the element you want to capture in the browser developer tools.
        // 2. Identify a unique selector (e.g., class, id, or text).
        // 3. Add a new block like the examples above:
        //    const newFeature = page.locator('.your-selector');
        //    await newFeature.screenshot({ path: path.join(assetsDir, 'new-feature-name.png') });
        //    console.log('Taking New Feature Screenshot...');

    } catch (error) {
        console.error('Error taking screenshots:', error);
    } finally {
        await browser.close();
        server.kill();
    }
}

main();
