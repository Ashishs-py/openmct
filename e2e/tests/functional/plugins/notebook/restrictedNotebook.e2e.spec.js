/*****************************************************************************
 * Open MCT, Copyright (c) 2014-2023, United States Government
 * as represented by the Administrator of the National Aeronautics and Space
 * Administration. All rights reserved.
 *
 * Open MCT is licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Open MCT includes source code licensed under additional open source
 * licenses. See the Open Source Licenses file (LICENSES.md) included with
 * this source code distribution or the Licensing information page available
 * at runtime from the About dialog for additional information.
 *****************************************************************************/

const { test, expect, streamToString } = require('../../../../pluginFixtures');
const { openObjectTreeContextMenu, createDomainObjectWithDefaults } = require('../../../../appActions');
const path = require('path');
const nbUtils = require('../../../../helper/notebookUtils');

const TEST_TEXT = 'Testing text for entries.';
const TEST_TEXT_NAME = 'Test Page';
const CUSTOM_NAME = 'CUSTOM_NAME';

test.describe('Restricted Notebook', () => {
    let notebook;
    test.beforeEach(async ({ page }) => {
        notebook = await startAndAddRestrictedNotebookObject(page);
    });

    test('Can be renamed @addInit', async ({ page }) => {
        await expect(page.locator('.l-browse-bar__object-name')).toContainText(`${notebook.name}`);
    });

    test('Can be deleted if there are no locked pages @addInit', async ({ page }) => {
        await openObjectTreeContextMenu(page, notebook.url);

        const menuOptions = page.locator('.c-menu ul');
        await expect.soft(menuOptions).toContainText('Remove');

        const restrictedNotebookTreeObject = page.locator(`a:has-text("${notebook.name}")`);

        // notebook tree object exists
        expect.soft(await restrictedNotebookTreeObject.count()).toEqual(1);

        // Click Remove Text
        await page.locator('li[role="menuitem"]:has-text("Remove")').click();

        // Click 'OK' on confirmation window and wait for save banner to appear
        await Promise.all([
            page.waitForNavigation(),
            page.locator('button:has-text("OK")').click(),
            page.waitForSelector('.c-message-banner__message')
        ]);

        // has been deleted
        expect(await restrictedNotebookTreeObject.count()).toEqual(0);
    });

    test('Can be locked if at least one page has one entry @addInit', async ({ page }) => {

        await nbUtils.enterTextEntry(page, TEST_TEXT);

        const commitButton = page.locator('button:has-text("Commit Entries")');
        expect(await commitButton.count()).toEqual(1);
    });

});

test.describe('Restricted Notebook with at least one entry and with the page locked @addInit', () => {
    let notebook;
    test.beforeEach(async ({ page }) => {
        notebook = await startAndAddRestrictedNotebookObject(page);
        await nbUtils.enterTextEntry(page, TEST_TEXT);
        await lockPage(page);

        // open sidebar
        await page.locator('button.c-notebook__toggle-nav-button').click();
    });

    test('Locked page should now be in a locked state @addInit @unstable', async ({ page }, testInfo) => {
        // eslint-disable-next-line playwright/no-skipped-test
        test.skip(testInfo.project === 'chrome-beta', "Test is unreliable on chrome-beta");
        // main lock message on page
        const lockMessage = page.locator('text=This page has been committed and cannot be modified or removed');
        expect.soft(await lockMessage.count()).toEqual(1);

        // lock icon on page in sidebar
        const pageLockIcon = page.locator('ul.c-notebook__pages li div.icon-lock');
        expect.soft(await pageLockIcon.count()).toEqual(1);

        // no way to remove a restricted notebook with a locked page
        await openObjectTreeContextMenu(page, notebook.url);
        const menuOptions = page.locator('.c-menu ul');

        await expect(menuOptions).not.toContainText('Remove');
    });

    test('Can still: add page, rename, add entry, delete unlocked pages @addInit', async ({ page }) => {
        // Click text=Page Add >> button
        await Promise.all([
            page.waitForNavigation(),
            page.locator('text=Page Add >> button').click()
        ]);
        // Click text=Unnamed Page >> nth=1
        await page.locator('text=Unnamed Page').nth(1).click();
        // Press a with modifiers
        await page.locator('text=Unnamed Page').nth(1).fill(TEST_TEXT_NAME);

        // expect to be able to rename unlocked pages
        const newPageElement = page.locator(`text=${TEST_TEXT_NAME}`);
        const newPageCount = await newPageElement.count();
        await newPageElement.press('Enter'); // exit contenteditable state
        expect.soft(newPageCount).toEqual(1);

        // enter test text
        await nbUtils.enterTextEntry(page, TEST_TEXT);

        // expect new page to be lockable
        const commitButton = page.locator('BUTTON:HAS-TEXT("COMMIT ENTRIES")');
        expect.soft(await commitButton.count()).toEqual(1);

        // Click text=Unnamed PageTest Page >> button
        await page.locator('text=Unnamed PageTest Page >> button').click();
        // Click text=Delete Page
        await page.locator('text=Delete Page').click();
        // Click text=Ok
        await Promise.all([
            page.waitForNavigation(),
            page.locator('button:has-text("OK")').click()
        ]);

        // deleted page, should no longer exist
        const deletedPageElement = page.locator(`text=${TEST_TEXT_NAME}`);
        expect(await deletedPageElement.count()).toEqual(0);
    });
});

test.describe('Restricted Notebook with a page locked and with an embed @addInit', () => {

    test.beforeEach(async ({ page }) => {
        const notebook = await startAndAddRestrictedNotebookObject(page);
        await nbUtils.dragAndDropEmbed(page, notebook);
    });

    test('Allows embeds to be deleted if page unlocked @addInit', async ({ page }) => {
        // Click .c-ne__embed__name .c-popup-menu-button
        await page.locator('.c-ne__embed__name .c-icon-button').click(); // embed popup menu

        const embedMenu = page.locator('body >> .c-menu');
        await expect(embedMenu).toContainText('Remove This Embed');
    });

    test('Disallows embeds to be deleted if page locked @addInit', async ({ page }) => {
        await lockPage(page);
        // Click .c-ne__embed__name .c-popup-menu-button
        await page.locator('.c-ne__embed__name .c-icon-button').click(); // embed popup menu

        const embedMenu = page.locator('body >> .c-menu');
        await expect(embedMenu).not.toContainText('Remove This Embed');
    });

});

test.describe('can export restricted notebook as text', () => {
    test.beforeEach(async ({ page }) => {
        await startAndAddRestrictedNotebookObject(page);
    });

    test('basic functionality ', async ({ page }) => {
        await nbUtils.enterTextEntry(page, `Foo bar entry`);
        // Click on 3 Dot Menu
        await page.locator('button[title="More options"]').click();
        const downloadPromise = page.waitForEvent('download');

        await page.getByRole('menuitem', { name: /Export Notebook as Text/ }).click();

        await page.getByRole('button', { name: 'Save' }).click();
        const download = await downloadPromise;
        const readStream = await download.createReadStream();
        const exportedText = await streamToString(readStream);
        expect(exportedText).toContain('Foo bar entry');

    });

    test.fixme('can export multiple notebook entries as text ', async ({ page }) => {});
    test.fixme('can export all notebook entry metdata', async ({ page }) => {});
    test.fixme('can export all notebook tags', async ({ page }) => {});
    test.fixme('can export all notebook snapshots', async ({ page }) => {});
});

/**
 * @param {import('@playwright/test').Page} page
 */
async function startAndAddRestrictedNotebookObject(page) {
    // eslint-disable-next-line no-undef
    await page.addInitScript({ path: path.join(__dirname, '../../../../helper/', 'addInitRestrictedNotebook.js') });
    await page.goto('./', { waitUntil: 'domcontentloaded' });

    return createDomainObjectWithDefaults(page, { type: CUSTOM_NAME });
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function lockPage(page) {
    const commitButton = page.locator('button:has-text("Commit Entries")');
    await commitButton.click();

    //Wait until Lock Banner is visible
    await page.locator('text=Lock Page').click();
}
