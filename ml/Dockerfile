FROM python:3.14-slim
WORKDIR /app
COPY ml/requirements.txt /app/ml/requirements.txt
RUN pip install --no-cache-dir -r ml/requirements.txt
COPY ml /app/ml
RUN python -m ml.train && useradd --create-home model
USER model
EXPOSE 8001
CMD ["uvicorn", "ml.service:app", "--host", "0.0.0.0", "--port", "8001"]
