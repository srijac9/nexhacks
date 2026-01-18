from fastapi import FastAPI
from answer import router as answer_router
from analyze import router as analyze_router
from process_schematic import router as process_schematic_router

app = FastAPI(title="Circuit Tutor API")

# Mount both apps under same server
app.include_router(answer_router)   # provides /answer and /health (from answer)
app.include_router(analyze_router)  # provides /analyze and /health (from analyze)
app.include_router(process_schematic_router)  # provides /process-schematic and /health (from process_schematic)

# Optional: add a root route so / doesn't 404
@app.get("/")
def home():
    return {"ok": True, "routes": ["/analyze", "/answer", "/docs"]}
