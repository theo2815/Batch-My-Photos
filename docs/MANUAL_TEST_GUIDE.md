# Manual Test Guide: Batch System Changes

This guide covers all 14 fixes implemented in the batch system review.
Each test has setup instructions, exact steps, and expected results.

**How to run the app:**
```
npm start
```
This launches Vite dev server + Electron. Wait for the window to appear.

---

## SETUP: Create Test Folders

Before testing, create these folders on your machine. Use any real `.jpg` or `.png` photos you have. You can also bulk-create dummy test images.

### Quick way to create test images (PowerShell)

Run this in PowerShell to create 50 small test JPG files:

```powershell
# Create test folder
$testFolder = "$env:USERPROFILE\Desktop\BatchTest_Source"
New-Item -ItemType Directory -Force -Path $testFolder

# Create 50 dummy JPEG files (~1KB each)
# These are valid JPEG headers so the app recognizes them
$jpegHeader = [byte[]](0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01)
$jpegFooter = [byte[]](0xFF, 0xD9)
$padding = New-Object byte[] 1000

for ($i = 1; $i -le 50; $i++) {
    $name = "photo_{0:D4}.jpg" -f $i
    $path = Join-Path $testFolder $name
    $stream = [System.IO.File]::Create($path)
    $stream.Write($jpegHeader, 0, $jpegHeader.Length)
    $stream.Write($padding, 0, $padding.Length)
    $stream.Write($jpegFooter, 0, $jpegFooter.Length)
    $stream.Close()
}

# Also create some "grouped" files (same base name, different extensions)
# Simulates RAW+JPG pairs
for ($i = 1; $i -le 5; $i++) {
    $baseName = "paired_{0:D2}" -f $i

    $jpgPath = Join-Path $testFolder "$baseName.jpg"
    $pngPath = Join-Path $testFolder "$baseName.png"

    $stream = [System.IO.File]::Create($jpgPath)
    $stream.Write($jpegHeader, 0, $jpegHeader.Length)
    $stream.Write($padding, 0, $padding.Length)
    $stream.Write($jpegFooter, 0, $jpegFooter.Length)
    $stream.Close()

    # PNG file (minimal valid PNG)
    $pngHeader = [byte[]](0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
    $stream2 = [System.IO.File]::Create($pngPath)
    $stream2.Write($pngHeader, 0, $pngHeader.Length)
    $stream2.Write($padding, 0, $padding.Length)
    $stream2.Close()
}

# Create some non-media files (should be SKIPPED by the app)
"test data" | Out-File (Join-Path $testFolder "notes.txt")
"csv,data" | Out-File (Join-Path $testFolder "data.csv")
"" | Out-File (Join-Path $testFolder "desktop.ini")

Write-Host "Created test folder at: $testFolder"
Write-Host "  - 50 photo_XXXX.jpg files"
Write-Host "  - 5 paired_XX.jpg + 5 paired_XX.png files (10 files in 5 groups)"
Write-Host "  - 3 non-media files (notes.txt, data.csv, desktop.ini)"
Write-Host "  - Total: 63 files on disk, 60 media files expected"
```

**Total files created:** 63 on disk, but only **60 are media files** (the app should skip `notes.txt`, `data.csv`, `desktop.ini`).

---

## TEST 1: Same-Drive Move + Progress Accuracy

**Tests:** Fix #1 (progress counter), Fix #3 (same-drive count), Fix #13 (totalFiles filtered), Fix #4 (sortBy validation), Fix #10 (two-pass bin-packing)

### Setup
- Use the `BatchTest_Source` folder from above (on your C: drive)
- Make sure it has the 63 files (60 media + 3 non-media)

### Steps

1. Open the app
2. Click **Select Folder** and choose `BatchTest_Source`
3. Observe the **scan results**:
   - **Expected:** Should show **60 files** (not 63). The 3 non-media files (`notes.txt`, `data.csv`, `desktop.ini`) should be excluded
4. Set **Max files per batch** to `10`
5. Set **Sort by** to `Name (A-Z)`
6. Set **Output prefix** to `Test`
7. Click **Preview** and verify:
   - Batch count should be reasonable (around 6-7 batches for 60 files at 10 per batch)
   - Files within each batch should be in alphabetical order
8. Click **Execute** (use **Move** mode, default)
9. Watch the **progress bar**:
   - **Expected:** Progress should go from 0 to 60, NOT 0 to 63
   - Progress should advance smoothly, no jumps
10. When complete, check the **results screen**:
    - **Expected:** "60 files processed" (not 63)
    - Batch folders should be created inside `BatchTest_Source`
11. Open `BatchTest_Source` in Explorer:
    - **Expected:** Batch folders like `Test_01`, `Test_02`, etc. exist
    - The 3 non-media files (`notes.txt`, `data.csv`, `desktop.ini`) should **still be in the root** (not moved)
    - Each batch folder should contain ~10 media files

### Pass Criteria
- [ ] Scan shows 60 files, not 63
- [ ] Progress bar goes to 60/60
- [ ] Results say 60 files processed
- [ ] Non-media files are untouched in root folder
- [ ] Files within each batch are alphabetically ordered

---

## TEST 2: Undo / Rollback (Same-Drive)

**Tests:** Fix #6 (stale auto-expire), Fix #7 (rollback checkpoint)

### Prerequisites
- Complete TEST 1 first (files are in batch folders)

### Steps

1. After TEST 1 completes, you should see an **Undo** button on the results screen
2. Click **Undo**
3. Confirm when prompted
4. Watch the progress:
   - **Expected:** All 60 files move back to the root of `BatchTest_Source`
5. When complete:
   - **Expected:** "60 files restored" message
   - Empty batch folders should be deleted automatically
6. Open `BatchTest_Source` in Explorer:
   - **Expected:** All 60 media files are back in the root folder
   - The 3 non-media files are still there (never moved)
   - No empty batch folders remain

### Pass Criteria
- [ ] Undo restores all 60 files
- [ ] Empty batch folders are deleted
- [ ] Non-media files are untouched
- [ ] App returns to results/complete screen showing undo summary

---

## TEST 3: Copy Mode + Copy Verification

**Tests:** Fix #11 (copy verification), Fix #14 (disk space pre-check)

### Setup
- Make sure the files are back in `BatchTest_Source` (do TEST 2 first, or re-create them)
- Create a separate output folder: `Desktop\BatchTest_Output`

### Steps

1. Open the app
2. Select `BatchTest_Source` as source folder
3. Switch mode to **Copy**
4. Click **Select Output Folder** and choose `BatchTest_Output`
5. Set max files per batch to `15`
6. Set prefix to `CopyTest`
7. Click **Execute**
8. Observe:
   - **Expected:** A disk space validation should run first (you may see a brief "Validating..." state)
   - Progress should advance to 60/60
9. When complete:
   - Check `BatchTest_Output`: should have batch folders with copies of the files
   - Check `BatchTest_Source`: **original files should still be there** (this is copy mode)
10. **Verify file sizes match:**
    - Pick any file in a batch folder
    - Compare its size to the original in `BatchTest_Source`
    - **Expected:** Sizes are identical (Fix #11 verifies this during copy)

### Pass Criteria
- [ ] Disk space validation runs before execution
- [ ] 60 files copied successfully
- [ ] Original files remain in source folder
- [ ] File sizes in output match source exactly
- [ ] If not enough disk space, app shows a warning BEFORE starting

---

## TEST 4: Cross-Drive Move (if you have a USB drive or second drive)

**Tests:** Fix #2 (cross-drive unlink separation), Fix #14 (cross-drive disk space check)

### Setup
- You need a USB drive or second partition (e.g., D: drive)
- Copy the test files to the USB/second drive: e.g., `D:\BatchTest_CrossDrive`
- Create an output folder on C: drive: `Desktop\BatchTest_CrossOutput`

**If you don't have a second drive, SKIP this test.** The cross-drive code path only activates when source and destination are on different drives.

### Steps

1. Open the app
2. Select `D:\BatchTest_CrossDrive` as source
3. Switch to **Move** mode
4. You may need to select an output folder on C: drive
5. Set max files per batch to `20`
6. Click **Execute**
7. Observe:
   - **Expected:** Disk space validation should check free space on C: drive
   - Progress bar should advance smoothly
   - In the terminal/console, look for the log: `"Cross-drive move - using async copy+delete"`
8. When complete, verify:
   - Files are in batch folders on C: drive
   - Files are **removed** from D: drive (source)

### If a file fails to delete from source (locked file):
- **Expected:** Error message should say `"Moved successfully but source cleanup failed: ..."`
- This is Fix #2 in action: the copy succeeded, but source deletion failed

### Pass Criteria
- [ ] Cross-drive detected automatically
- [ ] Disk space checked before execution
- [ ] Files moved successfully (in destination, removed from source)
- [ ] If unlink fails, error says "Moved successfully but source cleanup failed"

---

## TEST 5: Crash Recovery - Batch Resume

**Tests:** Fix #8 (count-only checkpoint), Fix #9 (gzip compressed manifest)

### Setup
- Put the 60 media files back in `BatchTest_Source`

### Steps

1. Open the app
2. Select `BatchTest_Source`
3. Set max files per batch to `5` (creates many batches to give time to cancel)
4. Click **Execute** in Move mode
5. **Immediately click Cancel** while the batch is running (within the first second)
6. Confirm cancellation
7. Observe:
   - **Expected:** Operation stops partway. Some files moved, some still in root
   - Results should say "Operation cancelled" with partial count
8. **Close the app completely** (close the window)
9. **Reopen the app** (`npm start`)
10. On startup:
    - **Expected:** A "Resume interrupted operation?" dialog should appear
    - It should show the folder path and how many files were processed
11. Click **Resume**
12. Observe:
    - **Expected:** Only the remaining files are processed (not starting from scratch)
    - Progress should start from where it left off
13. When complete, all 60 files should be in batch folders

### Pass Criteria
- [ ] Cancel stops operation mid-way
- [ ] On relaunch, resume dialog appears
- [ ] Resume processes only remaining files
- [ ] Final result: all 60 files in batch folders
- [ ] No duplicate files

### Alternative: Test Discard
Repeat steps 1-9, but click **Discard** instead of Resume:
- **Expected:** Progress is cleared, partial files remain where they are
- No resume dialog on next launch

---

## TEST 6: Crash Recovery - Rollback Resume

**Tests:** Fix #6 (stale auto-expire), Fix #7 (rollback two-tier checkpoint)

### Setup
- Complete a batch operation first (60 files in batch folders)

### Steps

1. After batch completion, click **Undo**
2. Confirm the undo
3. **While undo is in progress, force-close the app:**
   - Press `Ctrl+C` in the terminal that started the app, OR
   - Use Task Manager to end the Electron process
   - Do this quickly while files are still being restored
4. **Reopen the app** (`npm start`)
5. On startup:
   - **Expected:** A "Resume interrupted rollback?" dialog should appear
   - Shows how many files were restored and how many remain
6. Click **Resume**
7. Observe:
   - **Expected:** Rollback continues from where it stopped
   - Only remaining files are moved back
8. When complete, all files should be back in the root folder

### Pass Criteria
- [ ] Force-closing during rollback preserves progress
- [ ] Resume dialog appears on next launch
- [ ] Resume only processes remaining files
- [ ] All files restored to original locations

---

## TEST 7: Operation History

**Tests:** Fix #6 (history integration), Fix #12 (operations not in IPC)

### Setup
- Start with files in `BatchTest_Source` (undo previous batches if needed)

### Steps

1. Run a batch (Move mode, any settings)
2. After completion, look for **History** button/icon in the app
3. Open the **History** panel
4. **Expected:** Your recent batch operation is listed with:
   - Date/time
   - Source folder path
   - Number of files
   - Number of batches
5. Click **Undo** on the history entry
6. Confirm when prompted
7. **Expected:** Files are rolled back to their original locations
8. Check history again:
   - **Expected:** The entry is removed after successful undo

### CSV Export Test
1. Run another batch operation
2. After completion, look for **Export Report** or **Download CSV** button
3. Click it and save the CSV file
4. Open the CSV:
   - **Expected:** Contains file names, original paths, new paths, batch folders
   - Should list all 60 media files (not 63)

### Pass Criteria
- [ ] History shows past operations
- [ ] Undo from history works
- [ ] History entry removed after successful undo
- [ ] CSV export works and contains correct data

---

## TEST 8: Sort Order + Bin-Packing

**Tests:** Fix #10 (two-pass bin-packing), Fix #4 (sortBy validation)

### Setup
- Files in `BatchTest_Source` (60 media files)

### Steps

1. Select the folder, set max files per batch to `8`
2. **Test each sort mode** by clicking Preview (don't execute):

   **a) Name A-Z:**
   - Click Preview
   - Look at the batch preview details
   - **Expected:** Files within each batch are in alphabetical order
   - Note the number of batches created

   **b) Name Z-A:**
   - Change sort to Name Z-A
   - Click Preview
   - **Expected:** Files within each batch are in reverse alphabetical order
   - Total batch count should be the **same** as Name A-Z (packing is identical, only internal order changes)

   **c) Size (largest first):**
   - Change sort to Size
   - Click Preview
   - Batch count should be the same (or very close)

3. **Key verification:** The total number of batches should be consistent across all sort modes because Fix #10 uses optimal bin-packing regardless of display order.

### Pass Criteria
- [ ] Files within batches respect the chosen sort order
- [ ] Batch count is the same (or very close) regardless of sort mode
- [ ] Preview works for all sort modes without errors

---

## TEST 9: Non-Media File Filtering

**Tests:** Fix #13 (totalFiles uses filtered count)

### Setup
- Use `BatchTest_Source` with mixed files (60 media + 3 non-media)

### Steps

1. Select the folder
2. Scan results should show **60 files** (not 63)
3. Click Preview:
   - Batch preview should account for 60 files
   - `notes.txt`, `data.csv`, `desktop.ini` should NOT appear in any batch
4. Execute in Move mode
5. After completion:
   - **Expected:** Results say "60 files processed"
   - `notes.txt`, `data.csv`, `desktop.ini` remain in the root folder untouched

### Pass Criteria
- [ ] Scan count is 60
- [ ] Non-media files not in any batch preview
- [ ] Execution processes exactly 60 files
- [ ] Non-media files untouched after execution

---

## TEST 10: Pre-Execution Validation

**Tests:** Fix #14 (disk space + permission checks)

### Steps

**a) Normal validation (should pass):**
1. Select a folder with files
2. Click Execute
3. **Expected:** Brief "Validating..." state, then execution starts normally

**b) Read-only folder (if possible):**
1. Create a folder and set it to read-only:
   ```powershell
   $readonlyFolder = "$env:USERPROFILE\Desktop\ReadOnlyTest"
   New-Item -ItemType Directory -Force -Path $readonlyFolder
   icacls $readonlyFolder /deny "${env:USERNAME}:(W)"
   ```
2. Try to use this as the output folder for a Copy operation
3. **Expected:** Safety warning appears saying "Permission denied"
4. Clean up:
   ```powershell
   icacls "$env:USERPROFILE\Desktop\ReadOnlyTest" /remove:d "${env:USERNAME}"
   Remove-Item "$env:USERPROFILE\Desktop\ReadOnlyTest"
   ```

**c) Network/UNC path (if available):**
1. If you have a network share, select it as source or output
2. **Expected:** Advisory warning about "Network drive detected"

### Pass Criteria
- [ ] Normal validation passes silently
- [ ] Read-only folder shows permission warning
- [ ] Network path shows advisory warning

---

## TEST 11: Edge Case - Empty Folder

### Steps

1. Create an empty folder: `Desktop\EmptyTest`
2. Select it in the app
3. **Expected:** Scan shows 0 files, 0 groups
4. Try to execute:
   - **Expected:** Either the Execute button is disabled, or it completes immediately with 0 files processed

### Pass Criteria
- [ ] Empty folder doesn't crash the app
- [ ] Graceful handling (no errors)

---

## TEST 12: Edge Case - Large Batch Number

### Steps

1. Use the 60-file test folder
2. Set max files per batch to `1` (creates 55+ batches for 55 unique base names)
3. Click Preview:
   - **Expected:** Shows many batches, no crash
4. Execute:
   - **Expected:** Many folders created, all files distributed
5. Undo:
   - **Expected:** All files restored, all empty folders deleted

### Pass Criteria
- [ ] Many batches created without error
- [ ] All files in correct folders
- [ ] Undo cleans up all folders

---

## Reporting Issues

When reporting an issue, include:

1. **Which test failed** (e.g., "TEST 3, step 8")
2. **What you expected** vs **what happened**
3. **Error message** (if any) - check both the app UI and the terminal console
4. **Console logs** - the terminal where you ran `npm start` will show detailed logs with emojis like:
   - `[EXECUTOR]` - file operation logs
   - `[ROLLBACK]` - undo operation logs
   - `[PROGRESS]` - crash recovery logs
   - `[SECURITY]` - security validation logs
   - `[SORT]` / `[BATCH]` - sorting and packing logs
5. **Screenshots** if the UI looks wrong

---

## Quick Reference: What Each Fix Does

| Fix | What Changed | How to Spot It |
|-----|-------------|----------------|
| #1+#3 | Progress counter accuracy | Progress bar matches actual file count |
| #2 | Cross-drive unlink error tagging | Error message says "source cleanup failed" |
| #4 | Sort mode validation | Invalid sort modes default to Name A-Z |
| #5 | Blur groups capped at 10K | Only testable via code (defensive) |
| #6 | Stale rollback auto-expires (7 days) | Old resume dialogs won't appear forever |
| #7 | Rollback checkpoints are lightweight | Rollback resume works after crash |
| #8 | Progress checkpoints are lightweight | Batch resume works after crash |
| #9 | Manifest is gzip compressed | Faster batch start for large folders |
| #10 | Optimal bin-packing for all sorts | Same batch count regardless of sort |
| #11 | Copy mode verifies file sizes | Copied files match source sizes |
| #12 | Operations not sent via IPC | Faster results screen on large batches |
| #13 | File count excludes non-media | Correct count (60 not 63) |
| #14 | Disk space check for cross-drive | Warning before running out of space |
