import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("CHAVE_API_GEMINI"))

print("Modelos liberados para sua chave (que suportam geração):")
for m in genai.list_models():
    if 'generateContent' in m.supported_generation_methods:
        print(m.name)