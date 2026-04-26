#!/bin/bash

# Copy all fixed voicebot HTML files to static hosting directory

echo "Copying fixed voicebot pages to static hosting..."
echo ""

STATIC_DIR="backend/static/pages"
OUTPUTS_DIR="backend/outputs"

# Create static pages directory if it doesn't exist
mkdir -p "$STATIC_DIR"

count=0

# Find all HTML files with Conversation.startSession (voicebot pages)
while IFS= read -r html_file; do
    # Extract campaign ID from path
    # Path format: backend/outputs/COMPANY_ID/CAMPAIGN_ID/website/index.html
    campaign_id=$(echo "$html_file" | sed -n 's|.*outputs/[^/]*/\([^/]*\)/website/index.html|\1|p')
    
    if [ -n "$campaign_id" ]; then
        # Create campaign directory in static
        mkdir -p "$STATIC_DIR/$campaign_id"
        
        # Copy the fixed HTML file
        cp "$html_file" "$STATIC_DIR/$campaign_id/index.html"
        
        echo "[COPIED] Campaign: $campaign_id"
        ((count++))
    fi
done < <(grep -l "turn_detection" backend/outputs/*/*/website/index.html 2>/dev/null)

echo ""
echo "Done! Copied $count voicebot pages to static hosting."
echo "Files are in: $STATIC_DIR"
