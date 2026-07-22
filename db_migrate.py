import sys
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'backend'))

import server
server.init_db()
print("DB Migration Complete")
