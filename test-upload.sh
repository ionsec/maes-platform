#!/bin/bash

# Create a small test CSV file
cat > test-audit.csv << 'EOF'
CreationTime,UserId,Operation,ResultStatus,ClientIP
2025-01-13T10:00:00Z,user1@example.com,UserLoggedIn,Success,192.168.1.1
2025-01-13T10:05:00Z,user2@example.com,FileAccessed,Success,192.168.1.2
2025-01-13T10:10:00Z,user3@example.com,PasswordChanged,Success,192.168.1.3
2025-01-13T10:15:00Z,Unknown,FailedLogin,Failed,192.168.1.4
2025-01-13T10:20:00Z,admin@example.com,RoleAssigned,Success,192.168.1.5
EOF

echo "Test CSV file created: test-audit.csv"
echo "Contents:"
cat test-audit.csv
echo ""
echo "File can be uploaded via the UI at https://localhost/analysis"
echo "Click 'Upload Logs' and select this file as 'Unified Audit Log'"