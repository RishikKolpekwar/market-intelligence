#!/bin/bash

# Test script to see Google price calculations in action
# This will trigger the sync endpoint which properly handles API authentication

echo "================================================================================"
echo "GOOGLE (GOOGL) PRICE SYNC TEST"
echo "================================================================================"
echo ""
echo "This will sync GOOGL prices and show the calculation steps in the logs"
echo ""

# Trigger the sync for GOOGL specifically
# We'll watch the dev server logs to see the output

echo "🔄 Triggering price sync for GOOGL..."
echo ""

# Make the API call
curl -s http://localhost:3000/api/sync/all 2>&1 | jq '.' || echo "Note: Check dev server console for detailed logs"

echo ""
echo "================================================================================"
echo "✅ Sync completed - check the terminal where 'npm run dev' is running"
echo "    You should see detailed logs like:"
echo "    [Sync] GOOGL: ✅ Yahoo: \$XXX.XX"
echo "    [Sync] GOOGL: 📊 Recalculated change: \$X.XX (X.XX%)"
echo "================================================================================"
