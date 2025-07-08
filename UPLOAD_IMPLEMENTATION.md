# Upload Implementation for Independent Analysis

This implementation allows the Analysis component to work independently by accepting pre-extracted logs through file uploads.

## Overview

The solution adds an upload feature that allows users to:
1. Upload pre-extracted logs (JSON, CSV, TXT, LOG formats)
2. Specify the data type (UAL, Azure logs, etc.)
3. Run analysis on uploaded data without requiring a live extraction

## Key Changes

### Backend (API)

1. **New Upload Route** (`/api/src/routes/upload.js`)
   - POST `/api/upload/logs` - Accepts file uploads with data type
   - GET `/api/upload/extractions` - Lists uploaded extractions
   - Stores uploaded data temporarily in memory (app.locals)
   - Auto-cleanup after 24 hours

2. **Modified Analysis Route** (`/api/src/routes/analysis.js`)
   - Checks for uploaded extractions before database extractions
   - Supports both regular and uploaded extractions seamlessly

3. **Modified Extractions Route** (`/api/src/routes/extractions.js`)
   - Includes uploaded extractions in the listing
   - Marks them with `isUpload: true` flag

### Frontend

1. **Modified Analysis Component** (`/frontend/src/pages/Analysis.jsx`)
   - Added "Upload Logs" button
   - New upload dialog with file selection and metadata
   - Shows uploaded extractions with "Uploaded" chip
   - Seamless integration with existing analysis workflow

## Data Flow

1. User uploads a file through the Analysis page
2. File is processed and stored temporarily on the server
3. A virtual extraction record is created with `isUpload: true`
4. The uploaded extraction appears in the dropdown for analysis
5. User can run any analysis type on the uploaded data
6. Analysis workers need to handle uploaded data (check `isUpload` flag)

## Important Notes

### For Production

1. **Storage**: Current implementation uses in-memory storage. For production:
   - Use Redis or database for temporary storage
   - Implement proper file storage (S3, disk with cleanup)
   - Add file size limits and validation

2. **Security**: 
   - Add virus scanning for uploaded files
   - Validate file contents based on data type
   - Implement rate limiting for uploads

3. **Analysis Workers**: 
   - Workers need to be updated to handle uploaded data
   - Check for `isUpload` flag and read data from storage
   - May need different processing logic for uploaded vs extracted data

## Usage

1. Click "Upload Logs" on the Analysis page
2. Select the data type (e.g., Unified Audit Log)
3. Choose your log file (JSON format recommended)
4. Optionally set date ranges
5. Upload the file
6. Select the uploaded extraction from the dropdown
7. Run analysis as normal

## File Format Examples

### Unified Audit Log (JSON)
```json
[
  {
    "CreationDate": "2024-01-01T10:00:00",
    "UserIds": "user@domain.com",
    "Operations": "UserLoggedIn",
    "AuditData": {...}
  }
]
```

### Azure Sign-in Logs (JSON)
```json
[
  {
    "createdDateTime": "2024-01-01T10:00:00",
    "userPrincipalName": "user@domain.com",
    "status": {"errorCode": 0},
    "location": {...}
  }
]
```