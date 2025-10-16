# LLM Provider Setup Guide

## Overview

Doc-Buddy supports two LLM providers:
1. **Anthropic Claude** (Sonnet 4.5) - Recommended
2. **OpenAI GPT-4** (Turbo)

You only need to configure **one** of them. Choose based on your preference and API access.

## Option 1: Anthropic Claude (Recommended)

### Why Choose Anthropic?
- ✅ Excellent at technical and analytical tasks
- ✅ Better context understanding for complex queries
- ✅ More accurate tool calling
- ✅ Claude Sonnet 4.5 is the latest model (as of 2025)
- ✅ Good for Datadog query interpretation

### Step 1: Create an Anthropic Account

1. Go to: https://console.anthropic.com/
2. Click **"Sign Up"** (or **"Sign In"** if you have an account)
3. Complete the registration process
4. Verify your email

### Step 2: Add Credits (If Required)

1. Anthropic offers free trial credits for new accounts
2. If you need more credits:
   - Go to **"Billing"** in the console
   - Click **"Add Credits"**
   - Purchase credits (typically $5 minimum)

### Step 3: Create an API Key

1. In the Anthropic Console, go to **"API Keys"**
   - Direct link: https://console.anthropic.com/settings/keys

2. Click **"Create Key"** or **"+ New Key"**

3. Give it a name:
   ```
   Doc-Buddy
   ```

4. Click **"Create Key"**

5. **Copy the API key immediately!** It looks like:
   ```
   sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

   ⚠️ **Important**: You won't be able to see it again!

### Step 4: Add to .env File

1. Open your `.env` file:
   ```bash
   code .env
   ```

2. Add your Anthropic API key:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

3. Save the file

### Step 5: Test in Doc-Buddy

1. Start the app:
   ```bash
   npm run dev
   ```

2. Complete Datadog authentication (if not already done)

3. On the LLM provider selection screen, choose **"Anthropic Claude"**

4. Click **"Configure"**

5. You should see a success checkmark ✓

### Pricing (Anthropic)

Claude Sonnet 4.5 pricing (as of Jan 2025):
- **Input**: $3 per million tokens (~750,000 words)
- **Output**: $15 per million tokens (~750,000 words)

**Typical Usage:**
- Each query: ~500-2000 input tokens, ~500-1000 output tokens
- Cost per query: ~$0.001-0.003 (less than a penny)
- 1000 queries ≈ $1-3

## Option 2: OpenAI GPT-4

### Why Choose OpenAI?
- ✅ Widely known and tested
- ✅ Good general-purpose performance
- ✅ GPT-4 Turbo is fast and capable
- ✅ Established ecosystem

### Step 1: Create an OpenAI Account

1. Go to: https://platform.openai.com/signup
2. Click **"Sign up"** (or **"Log in"** if you have an account)
3. Complete the registration
4. Verify your email

### Step 2: Add Credits

1. OpenAI requires payment info before API access
2. Go to **"Billing"** → **"Payment methods"**
   - Direct link: https://platform.openai.com/account/billing/overview

3. Add a payment method (credit card)

4. Add credits:
   - Click **"Add to credit balance"**
   - Minimum is usually $5
   - Recommended: Start with $10-20

### Step 3: Create an API Key

1. Go to **"API keys"**
   - Direct link: https://platform.openai.com/api-keys

2. Click **"+ Create new secret key"**

3. Give it a name:
   ```
   Doc-Buddy
   ```

4. Optional: Set permissions to restrict access

5. Click **"Create secret key"**

6. **Copy the API key immediately!** It looks like:
   ```
   sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

   ⚠️ **Important**: You won't be able to see it again!

### Step 4: Add to .env File

1. Open your `.env` file:
   ```bash
   code .env
   ```

2. Add your OpenAI API key:
   ```bash
   OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

3. Save the file

### Step 5: Test in Doc-Buddy

1. Start the app:
   ```bash
   npm run dev
   ```

2. Complete Datadog authentication (if not already done)

3. On the LLM provider selection screen, choose **"OpenAI GPT-4"**

4. Click **"Configure"**

5. You should see a success checkmark ✓

### Pricing (OpenAI)

GPT-4 Turbo pricing (as of Jan 2025):
- **Input**: $10 per million tokens (~750,000 words)
- **Output**: $30 per million tokens (~750,000 words)

**Typical Usage:**
- Each query: ~500-2000 input tokens, ~500-1000 output tokens
- Cost per query: ~$0.005-0.040 (half a penny to 4 cents)
- 1000 queries ≈ $5-40

**Note**: OpenAI is ~3-8x more expensive than Anthropic for this use case.

## Complete .env Example

Your `.env` file should look like this:

```bash
# Datadog OAuth Configuration
DD_OAUTH_CLIENT_ID=your-datadog-client-id-here
DD_SITE=datadoghq.com
DD_OAUTH_REDIRECT_URI=http://localhost:60080/callback

# LLM Provider Configuration
# Option 1: Use Anthropic (recommended)
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Option 2: Use OpenAI (alternative)
# OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Application Settings
NODE_ENV=development
LOG_LEVEL=info
```

**You only need ONE of the API keys**, not both. Comment out (add `#` prefix) the one you're not using.

## Switching Between Providers

You can switch between providers at any time:

1. Make sure both API keys are in your `.env` file
2. In the app, go to Settings (gear icon in chat interface)
3. Select a different provider
4. The app will use the new provider for subsequent queries

## Troubleshooting

### Error: "Invalid API Key"

**For Anthropic:**
- Check that the key starts with `sk-ant-`
- Verify no extra spaces or newlines
- Ensure the key hasn't been revoked
- Check you have credits in your account

**For OpenAI:**
- Check that the key starts with `sk-proj-` or `sk-`
- Verify no extra spaces or newlines
- Ensure the key hasn't been revoked
- Check you have credits in your account

### Error: "Insufficient Credits"

**For Anthropic:**
1. Go to https://console.anthropic.com/settings/billing
2. Check your credit balance
3. Add more credits if needed

**For OpenAI:**
1. Go to https://platform.openai.com/account/billing/overview
2. Check your credit balance
3. Add payment method and credits if needed

### Error: "Rate Limit Exceeded"

You've hit the API rate limit. Solutions:

**For Anthropic:**
- Free tier: 50 requests per minute
- Wait a minute and try again
- Upgrade to a paid plan for higher limits

**For OpenAI:**
- Tier 1: 500 requests per minute
- Wait a minute and try again
- Check your usage tier at https://platform.openai.com/account/limits

### Error: "Model Not Found"

The configured model doesn't exist or you don't have access:

**For Anthropic:**
- Doc-Buddy uses `claude-sonnet-4-5-20250929`
- If this model is deprecated, update in `electron/main/llm/anthropic-provider.ts`
- Change to `claude-3-5-sonnet-20240229` or latest available

**For OpenAI:**
- Doc-Buddy uses `gpt-4-turbo`
- If unavailable, update in `electron/main/llm/openai-provider.ts`
- Change to `gpt-4` or `gpt-4-1106-preview`

### API Key Environment Variable Not Loading

1. Restart the application completely
2. Verify `.env` file is in the project root
3. Check for typos in variable names (case-sensitive)
4. Run `cat .env` to verify file contents
5. Ensure no quotes around the API key value

## Security Best Practices

### ✅ DO:
- Keep your API keys in `.env` file (gitignored)
- Use environment variables
- Rotate keys periodically
- Set up usage alerts in provider console
- Use separate keys for dev/prod

### ❌ DON'T:
- Commit API keys to version control
- Share keys publicly
- Use production keys in development
- Hardcode keys in source code
- Share keys in screenshots or logs

## Monitoring Usage

### Anthropic Console
1. Go to https://console.anthropic.com/settings/billing
2. View **"Usage"** tab
3. See requests, tokens, and costs
4. Set up usage alerts

### OpenAI Console
1. Go to https://platform.openai.com/usage
2. View daily usage breakdown
3. See costs by model
4. Set monthly spending limits at https://platform.openai.com/account/limits

## Cost Optimization Tips

1. **Use Anthropic for Cost Savings**
   - 3-8x cheaper than OpenAI
   - Similar or better quality for technical queries

2. **Keep Queries Focused**
   - Be specific in your questions
   - Avoid very long conversations
   - Clear chat when starting new topics

3. **Monitor Usage**
   - Check console dashboards weekly
   - Set up spending alerts
   - Review which queries use the most tokens

4. **Use Development Mode Wisely**
   - Test with simple queries first
   - Don't run stress tests on production API keys
   - Use mock data for UI testing

## Which Provider Should I Choose?

### Choose Anthropic Claude if:
- ✅ You want the best cost/performance ratio
- ✅ You're doing technical/analytical work
- ✅ You need accurate tool calling
- ✅ You prefer newer models

### Choose OpenAI GPT-4 if:
- ✅ You already have an OpenAI account
- ✅ You're familiar with GPT-4
- ✅ You have OpenAI credits to use
- ✅ You need GPT-4 specific features

**Recommendation**: Start with **Anthropic Claude** for most use cases.

## Next Steps

Once your LLM is configured:

1. ✅ Start the app: `npm run dev`
2. ✅ Complete the setup wizard
3. ✅ Ask your first question!
4. ✅ Check the usage dashboard after a few queries

Example first queries:
- "What services do I have in Datadog?"
- "Show me the latency for my-service-name"
- "What's the error rate for api-gateway over the last hour?"

Happy querying! 🚀
