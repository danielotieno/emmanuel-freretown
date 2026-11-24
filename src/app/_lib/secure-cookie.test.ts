import { describe, expect, it } from "vitest";
import { isSecureCookieHost } from "./secure-cookie";

describe("isSecureCookieHost", () => {
  it("is secure on the public and staff hosts", () => {
    expect(isSecureCookieHost("ackemmanuelfreretown.org")).toBe(true);
    expect(isSecureCookieHost("admin.ackemmanuelfreretown.org")).toBe(true);
    expect(isSecureCookieHost("staging.ackemmanuelfreretown.org")).toBe(true);
  });

  it("is not secure on loopback hosts, with or without a port", () => {
    expect(isSecureCookieHost("localhost")).toBe(false);
    expect(isSecureCookieHost("localhost:3100")).toBe(false);
    expect(isSecureCookieHost("admin.localhost:3000")).toBe(false);
    expect(isSecureCookieHost("127.0.0.1:3000")).toBe(false);
    expect(isSecureCookieHost("[::1]:3000")).toBe(false);
    expect(isSecureCookieHost("LOCALHOST")).toBe(false);
  });

  it("fails safe to secure when the host is missing or only looks like localhost", () => {
    expect(isSecureCookieHost(null)).toBe(true);
    expect(isSecureCookieHost(undefined)).toBe(true);
    expect(isSecureCookieHost("")).toBe(true);
    expect(isSecureCookieHost("localhost.example.com")).toBe(true);
    expect(isSecureCookieHost("notlocalhost")).toBe(true);
  });
});
