import CircuitBreaker from 'opossum';
import axios, { AxiosRequestConfig } from 'axios';
import { logger } from './logger';
import { config } from '../config';

// Circuit breaker options
const circuitBreakerOptions = {
  timeout: 10000, // 10 seconds timeout for requests
  errorThresholdPercentage: 50,
  resetTimeout: config.circuitBreaker.timeout,
  volumeThreshold: config.circuitBreaker.failureThreshold,
};

// Create circuit breakers for each service
const createServiceBreaker = (serviceName: string, baseUrl: string) => {
  const breaker = new CircuitBreaker(
    async (requestConfig: AxiosRequestConfig) => {
      const response = await axios({
        ...requestConfig,
        baseURL: baseUrl,
        headers: {
          ...requestConfig.headers,
          'X-Internal-API-Key': config.internalApiKey,
        },
      });
      return response.data;
    },
    circuitBreakerOptions
  );

  // Event listeners for monitoring
  breaker.on('open', () => {
    logger.warn(`Circuit breaker OPENED for ${serviceName}`, { service: serviceName });
  });

  breaker.on('halfOpen', () => {
    logger.info(`Circuit breaker HALF-OPEN for ${serviceName}`, { service: serviceName });
  });

  breaker.on('close', () => {
    logger.info(`Circuit breaker CLOSED for ${serviceName}`, { service: serviceName });
  });

  breaker.on('fallback', () => {
    logger.warn(`Circuit breaker fallback triggered for ${serviceName}`, { service: serviceName });
  });

  return breaker;
};

// Service circuit breakers
export const serviceBreakers = {
  speech: createServiceBreaker('speech-service', config.services.speech),
  video: createServiceBreaker('video-service', config.services.video),
  fraud: createServiceBreaker('fraud-service', config.services.fraud),
  nlp: createServiceBreaker('nlp-service', config.services.nlp),
};

// Health check for all services
export const checkServiceHealth = async (serviceName: keyof typeof serviceBreakers): Promise<boolean> => {
  const breaker = serviceBreakers[serviceName];
  
  if (!breaker.opened) {
    try {
      await breaker.fire({ method: 'GET', url: '/health' });
      return true;
    } catch (error) {
      logger.error(`Health check failed for ${serviceName}`, { error });
      return false;
    }
  }
  
  return false;
};

// Get circuit breaker status for all services
export const getCircuitBreakerStatus = () => {
  return Object.entries(serviceBreakers).reduce((acc, [name, breaker]) => {
    acc[name] = {
      state: breaker.opened ? 'OPEN' : breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
      stats: breaker.stats,
    };
    return acc;
  }, {} as Record<string, { state: string; stats: any }>);
};
