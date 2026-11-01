FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod -R 777 /app

EXPOSE 7860

ENV PORT=7860

CMD ["sh", "-c", "python cloud_daemon.py & python app.py"]
