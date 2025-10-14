import { useState, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';

interface PredictionResult {
  predictedPrice: number;
  confidence: number;
  trend: 'up' | 'down' | 'neutral';
}

export const usePricePrediction = (symbol: string, historicalPrices: number[]) => {
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (historicalPrices.length < 10) return;

    const makePrediction = async () => {
      setIsLoading(true);
      try {
        // Normalizar dados
        const prices = historicalPrices.slice(-20);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const normalized = prices.map(p => (p - min) / (max - min));

        // Criar modelo LSTM simples
        const model = tf.sequential({
          layers: [
            tf.layers.lstm({
              units: 50,
              returnSequences: true,
              inputShape: [10, 1]
            }),
            tf.layers.dropout({ rate: 0.2 }),
            tf.layers.lstm({
              units: 50,
              returnSequences: false
            }),
            tf.layers.dropout({ rate: 0.2 }),
            tf.layers.dense({ units: 1 })
          ]
        });

        model.compile({
          optimizer: tf.train.adam(0.001),
          loss: 'meanSquaredError'
        });

        // Preparar dados de treino
        const sequenceLength = 10;
        const X: number[][] = [];
        const y: number[] = [];

        for (let i = 0; i < normalized.length - sequenceLength; i++) {
          X.push(normalized.slice(i, i + sequenceLength));
          y.push(normalized[i + sequenceLength]);
        }

        const xData = X.map(seq => seq.map(val => [val]));
        const xTensor = tf.tensor3d(xData, [X.length, sequenceLength, 1]);
        const yTensor = tf.tensor2d(y, [y.length, 1]);

        // Treinar modelo
        await model.fit(xTensor, yTensor, {
          epochs: 50,
          batchSize: 32,
          verbose: 0
        });

        // Fazer previsão
        const lastSequence = normalized.slice(-sequenceLength);
        const inputData = [lastSequence.map(val => [val])];
        const inputTensor = tf.tensor3d(inputData, [1, sequenceLength, 1]);
        const predictionTensor = model.predict(inputTensor) as tf.Tensor;
        const normalizedPrediction = (await predictionTensor.data())[0];

        // Desnormalizar
        const predictedPrice = normalizedPrediction * (max - min) + min;
        const currentPrice = prices[prices.length - 1];
        const priceChange = ((predictedPrice - currentPrice) / currentPrice) * 100;

        // Calcular confiança baseada na volatilidade
        const volatility = Math.sqrt(
          prices.reduce((sum, p) => sum + Math.pow(p - currentPrice, 2), 0) / prices.length
        );
        const confidence = Math.max(0.5, Math.min(0.95, 1 - (volatility / currentPrice)));

        const trend = priceChange > 1 ? 'up' : priceChange < -1 ? 'down' : 'neutral';

        setPrediction({
          predictedPrice,
          confidence,
          trend
        });

        // Limpar tensores
        xTensor.dispose();
        yTensor.dispose();
        inputTensor.dispose();
        predictionTensor.dispose();
        model.dispose();
      } catch (error) {
        console.error('Erro na previsão:', error);
      } finally {
        setIsLoading(false);
      }
    };

    makePrediction();
  }, [symbol, historicalPrices]);

  return { prediction, isLoading };
};
