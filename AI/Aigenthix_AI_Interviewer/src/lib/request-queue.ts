/**
 * Request queue for AI API calls
 * Prevents overwhelming AI services and provides retry logic
 */

interface QueuedRequest<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retries: number;
  maxRetries: number;
  priority: number; // Higher priority = processed first
  createdAt: number;
}

class RequestQueue {
  private queue: QueuedRequest<any>[] = [];
  private processing: boolean = false;
  private concurrency: number;
  private activeRequests: number = 0;
  private defaultMaxRetries: number;
  private retryDelay: number;

  constructor(
    concurrency: number = 5,
    defaultMaxRetries: number = 3,
    retryDelay: number = 1000
  ) {
    this.concurrency = concurrency;
    this.defaultMaxRetries = defaultMaxRetries;
    this.retryDelay = retryDelay;
  }

  /**
   * Add a request to the queue
   */
  async enqueue<T>(
    execute: () => Promise<T>,
    options?: {
      priority?: number;
      maxRetries?: number;
      id?: string;
    }
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: options?.id || `req_${Date.now()}_${Math.random()}`,
        execute,
        resolve,
        reject,
        retries: 0,
        maxRetries: options?.maxRetries || this.defaultMaxRetries,
        priority: options?.priority || 0,
        createdAt: Date.now(),
      };

      // Insert based on priority (higher priority first)
      const insertIndex = this.queue.findIndex(
        (r) => r.priority < request.priority
      );
      if (insertIndex === -1) {
        this.queue.push(request);
      } else {
        this.queue.splice(insertIndex, 0, request);
      }

      // Start processing if not already
      this.process();
    });
  }

  /**
   * Process the queue
   */
  private async process(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.activeRequests < this.concurrency) {
      const request = this.queue.shift();
      if (!request) {
        break;
      }

      this.activeRequests++;
      this.executeRequest(request).finally(() => {
        this.activeRequests--;
        // Continue processing
        if (this.queue.length > 0) {
          this.process();
        } else {
          this.processing = false;
        }
      });
    }

    this.processing = false;
  }

  /**
   * Execute a request with retry logic
   */
  private async executeRequest<T>(request: QueuedRequest<T>): Promise<void> {
    try {
      const result = await request.execute();
      request.resolve(result);
    } catch (error) {
      // Check if we should retry
      if (request.retries < request.maxRetries) {
        request.retries++;
        
        // Wait before retrying (exponential backoff)
        const delay = this.retryDelay * Math.pow(2, request.retries - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Re-queue with higher priority (so it gets processed sooner)
        const insertIndex = this.queue.findIndex(
          (r) => r.priority < request.priority
        );
        if (insertIndex === -1) {
          this.queue.push(request);
        } else {
          this.queue.splice(insertIndex, 0, request);
        }

        // Continue processing
        this.process();
      } else {
        // Max retries exceeded
        request.reject(
          error instanceof Error
            ? error
            : new Error('Request failed after maximum retries')
        );
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      concurrency: this.concurrency,
    };
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue.forEach((request) => {
      request.reject(new Error('Queue cleared'));
    });
    this.queue = [];
  }
}

// Export singleton instance for AI API calls
export const aiRequestQueue = new RequestQueue(
  parseInt(process.env.AI_QUEUE_CONCURRENCY || '5', 10), // Process 5 AI requests concurrently
  parseInt(process.env.AI_QUEUE_MAX_RETRIES || '3', 10),
  parseInt(process.env.AI_QUEUE_RETRY_DELAY || '1000', 10)
);


