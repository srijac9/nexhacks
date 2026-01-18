from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from answer import router as answer_router
from analyze import router as analyze_router
from process_schematic import router as process_schematic_router
from speak import router as speak_router


app = FastAPI(title="Circuit Tutor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000/", "http://localhost:3000/"],
    allow_credentials=True,
    allow_methods=[""],
    allow_headers=[""],
)

app.include_router(answer_router)   # provides /answer and /health (from answer)
app.include_router(analyze_router)  # provides /analyze and /health (from analyze)
app.include_router(process_schematic_router)  # provides /process-schematic and /health (from process_schematic)
app.include_router(speak_router)

@app.get("/")
def home():
    return {"ok": True, "routes": ["/analyze", "/answer", "/docs", "/analyze-and-speak"]}