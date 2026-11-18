"use client";

import { useMutation } from "@tanstack/react-query";
import {
  sendEmailCode,
  verifyEmailCode,
} from "@/services/auth.service";

export function useSendEmailCodeMutation() {
  return useMutation({
    mutationFn: sendEmailCode,
  });
}

export function useVerifyEmailCodeMutation() {
  return useMutation({
    mutationFn: verifyEmailCode,
  });
}
