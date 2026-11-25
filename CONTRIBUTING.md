# Contributing

Thank you for helping. Library sheets carry the My CheatSheets name, so every one is checked by a person before it's added. That makes the checks below matter.

## Report a mistake

[Open an issue](https://github.com/my-cheatsheets/library/issues/new/choose) with the sheet, the entry, what's wrong, and where the right answer can be checked.

## Suggest a sheet

Open an issue saying what it should cover, and who it's for. A sheet that covers a set, such as countries or elements, must cover all of it.

## Add or change a sheet

1. **Write the sheet** on [my-cheatsheets.com](https://my-cheatsheets.com), then export it. You can start from the website's AI prompt, but check everything it writes.
2. **Make a folder** in `sheets/`, named by the sheet's ID: lowercase letters, numbers and hyphens, such as `knots-for-sailing`. The ID becomes its address, `my-cheatsheets.com/library/knots-for-sailing`, and never changes.
3. **Save the sheet** in the folder as `sheet.json`.
4. **Add `about.json`** beside it:

   ```json
   {
     "licence": "CC-BY-4.0",
     "credits": []
   }
   ```

   - `licence` is `CC-BY-4.0` unless you choose `CC0-1.0`, to give it away with no conditions, or `CC-BY-SA-4.0`, which you must use if the sheet adapts share-alike material, such as text from Wikipedia. Other licences aren't accepted.
   - `credits` lists anything taken from elsewhere that needs a credit, such as an image: `{ "text": "Flag of Oman: Government of Oman, Open Government Licence – Oman 1.0", "url": "https://…" }`. The `url` is optional.
5. **Check it:**

   ```bash
   curl -o validate.mjs https://my-cheatsheets.com/validate.mjs
   node scripts/check.mjs
   ```

   It needs Node.js 24 or later. Or paste the sheet into the website's import page, which uses the same validator. The checks run again on your pull request.
6. **If you're changing a sheet, keep its IDs.** People's copies are updated by matching sections and entries by ID, so change an entry's wording, not its `id`. A new `id` looks like one entry deleted and another added.
7. **Open a pull request**, and fill in its checklist.

## What makes a good library sheet

- **Correct.** Only what you're sure of, checked against a reliable source.
- **Complete.** A sheet covering a set covers every member of it.
- **In your own words.** Don't copy descriptions from manuals, support pages or other cheat sheets. Facts, such as a keyboard shortcut or a capital city, are fine. Someone else's wording isn't.
- **Credited.** Anything taken from elsewhere is credited in `about.json`, and its licence allows it to be shared under the sheet's licence.
- **Useful.** The things people really look up, grouped so they're easy to find.

Sheets about a company's products are welcome, using the product's name only to say what the sheet covers.

## For maintainers

**Never rewrite `main`.** Every version a sheet has had is published from `main`'s history, and the website needs the one a copy was made from to update it. A force push or a rewritten history loses versions. To take something back, commit its removal, knowing that the old version stays published.
