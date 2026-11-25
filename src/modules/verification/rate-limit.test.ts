import { describe, expect, it } from "vitest";
import { ipRateLimitSubject } from "./rate-limit";

describe("ipRateLimitSubject", () => {
  it.each([
    ["198.51.100.7", "198.51.100.7"],
    [" 198.51.100.7 ", "198.51.100.7"],
    ["::ffff:198.51.100.7", "198.51.100.7"],
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"],
    ["2001:0DB8:0001:0002:abcd::1", "2001:db8:1:2::/64"],
    ["2001:db8:1:2::", "2001:db8:1:2::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
  ])("counts %j as %j", (ip, subject) => {
    expect(ipRateLimitSubject(ip)).toBe(subject);
  });

  it("puts two addresses of one /64 together and different /64s apart", () => {
    expect(ipRateLimitSubject("2001:db8:1:2::a")).toBe(ipRateLimitSubject("2001:db8:1:2:ffff::b"));
    expect(ipRateLimitSubject("2001:db8:1:2::a")).not.toBe(ipRateLimitSubject("2001:db8:1:3::a"));
  });

  it.each(["", "not-an-ip", "1:2:3", "2001:db8::1::2", "gggg::1"])(
    "uses %j as given when it can't be parsed",
    (ip) => {
      expect(ipRateLimitSubject(ip)).toBe(ip.trim().toLowerCase());
    },
  );
});
