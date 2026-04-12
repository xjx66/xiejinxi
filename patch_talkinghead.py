import re
import sys

with open("talkinghead.js", "r") as f:
    content = f.read()

# We need to replace from `const nodeAvatar = document.getElementById('talkinghead-container');`
# up to `if (!nodeAvatar) return;`
# Actually, let's just replace the entire DOMContentLoaded block carefully.
# Or we can do it via a more targeted regex.
