# Catalyst-Relay / Catalyst-Edit TODO

## Priority 1: Virtual File Explorer Fixes

### Issue 1: Content Counts Not Showing
**Symptom:** Tree items show "ZSNAP (undefined)" instead of "ZSNAP (111)"

**Root Cause:** The `count` field from SAP's response is not being properly propagated through to the TreeDataProvider.

**Files to Check:**

Catalyst-Relay:
- `C:\Artisan\Catalyst\Catalyst-Relay\src\core\adt\discovery\tree.ts`
  - `extractForTree()` - parses `counter` attribute from `vfs:virtualFolder`
  - `VirtualFolder.count` - should contain the count
  - `convertToTreeNodes()` - may not be passing count to TreeNode

Catalyst-Edit:
- `C:\Artisan\Catalyst\Catalyst-Edit\src\relay\tree_search.ts`
  - `convertToTreeDiscoveryResponse()` - converts TreeNode[] to TreeDiscoveryResponse
  - `getNodeCount()` - attempts to extract count from node
- `C:\Artisan\Catalyst\Catalyst-Edit\src\editor\ui\sap_virtual_file_system\tree\tree_data_provider.ts`
  - Where TreeItem labels are constructed with counts

Python Reference:
- `C:\Artisan\SNAP-Relay-API\snap_relay_api\clients\adt\types\response\tree_discovery.py`
  - `VirtualFolder` model with `count` field
- `C:\Artisan\SNAP-Relay-API\snap_relay_api\clients\adt\utils\tree_discovery_utils.py`
  - `extract_for_tree()` - how counts are parsed from XML

**Fix Needed:**
1. Ensure `TreeNode` interface includes `count?: number` field
2. Pass count through in `convertToTreeNodes()`
3. Verify `tree_search.ts` properly extracts and passes count
4. Update TreeDataProvider to display count in label

---

### Issue 2: Recursive Folder Download Not Working
**Symptom:** Right-click "Extract all contents" on a virtual folder doesn't work

**Files to Check:**

Catalyst-Edit:
- `C:\Artisan\Catalyst\Catalyst-Edit\src\editor\ui\sap_virtual_file_system\extraction\extract_files.ts`
  - Main extraction logic
- `C:\Artisan\Catalyst\Catalyst-Edit\src\editor\ui\sap_virtual_file_system\extraction\index.ts`
  - Exports for extraction module
- `C:\Artisan\Catalyst\Catalyst-Edit\src\editor\ui\sap_virtual_file_system\tree\tree_utils.ts`
  - Tree traversal utilities

Python Reference:
- `C:\Artisan\SNAP-Relay-API\snap_relay_api\clients\adt\client.py`
  - `read_folder_recurse()` method (around line 350-390) - recursive folder reading
  - `tree_discovery()` method (lines 682-704) - base tree discovery

**Fix Needed:**
1. Check if extraction commands are registered properly
2. Verify recursive tree traversal works with new TreeDiscoveryQuery format
3. Ensure read operations work for batch object fetching

---

## Priority 2: Git Diff View Fixes

### Issue 3: Diff Not Populated in Diff View
**Symptom:** Compare to server opens diff view but no diff content shows

**Files to Check:**

Catalyst-Edit:
- `C:\Artisan\Catalyst\Catalyst-Edit\src\editor\ui\sap_virtual_file_system\diffing\git_diff.ts`
  - `gitDiff()` function - main diff flow
  - `diffResultToVirtualFile()` - converts diff results to virtual files
- `C:\Artisan\Catalyst\Catalyst-Edit\src\editor\ui\sap_virtual_file_system\utils.ts`
  - `openVirtualFiles()` - opens files in diff view
- `C:\Artisan\Catalyst\Catalyst-Edit\src\editor\ui\sap_virtual_file_system\file_system_provider.ts`
  - `SAPVirtualFileSystemProvider` - handles virtual file content

Catalyst-Relay:
- `C:\Artisan\Catalyst\Catalyst-Relay\src\core\adt\craud\gitDiff.ts`
  - Diff calculation logic

Python Reference:
- `C:\Artisan\SNAP-Relay-API\snap_relay_api\clients\adt\utils\diff_manager.py`
  - Diff management utilities

---

### Issue 4: CodeLens Buttons Not Showing
**Symptom:** "Revert all", "Revert change", "Refresh", "Show local contents" buttons don't appear

**Files to Check:**

Catalyst-Edit:
- `C:\Artisan\Catalyst\Catalyst-Edit\src\editor\ui\sap_virtual_file_system\diffing\diff_codelens.ts`
  - `DiffCodeLensProvider` class
  - `provideCodeLenses()` - generates CodeLens items
  - Checks `SAP_VFSP` for cached objects and decorations
- `C:\Artisan\Catalyst\Catalyst-Edit\src\editor\ui\sap_virtual_file_system\instance.ts`
  - `onADTConnection()` - registers CodeLens provider (FIXED)
  - `SAP_VFSP.registerCodeLensProvider()` - actual registration
- `C:\Artisan\Catalyst\Catalyst-Edit\src\editor\ui\sap_virtual_file_system\file_system_provider.ts`
  - `registerCodeLensProvider()` method
  - `getCachedObject()` - returns diff data for CodeLens
  - `addDecorations()` - adds diff decorations to document
- `C:\Artisan\Catalyst\Catalyst-Edit\src\editor\ui\sap_virtual_file_system\diffing\revert_diff_changes.ts`
  - Revert functionality

**Fix Needed:**
1. Verify `registerCodeLensProvider()` is called and works
2. Check if `getCachedObject()` returns proper diff data
3. Ensure `addDecorations()` is called when opening virtual files
4. Verify CodeLens provider is registered for 'sap-virtual' scheme

---

## Summary of Changes Made So Far

### Fixed:
1. **VFS Provider Initialization** (`instance.ts`) - Logic was backwards, now properly initializes on first connection

### Implemented:
1. **Tree Discovery** (`tree.ts`) - Full Python-matching implementation with:
   - `TreeDiscoveryQuery` with PACKAGE/TYPE/GROUP/API facets
   - `hasChildrenOfSameFacet` logic for facetorder vs preselection
   - Recursive merge when `hasChildrenOfSameFacet=true`
   - Parent marker filtering

### Still Needs Work:
1. Count propagation through TreeNode → TreeDataProvider
2. Recursive extraction commands
3. Diff content population
4. CodeLens registration and display

---

## Key Reference Files in SNAP-Relay-API

| Feature | Python File |
|---------|-------------|
| Tree Discovery | `clients/adt/client.py` lines 682-704 |
| Recursive Folder Read | `clients/adt/client.py` lines 350-390 |
| Tree Utils | `clients/adt/utils/tree_discovery_utils.py` |
| Tree Types | `clients/adt/types/response/tree_discovery.py` |
| Tree Query Types | `clients/adt/types/request/tree_discovery.py` |
| Diff Manager | `clients/adt/utils/diff_manager.py` |
